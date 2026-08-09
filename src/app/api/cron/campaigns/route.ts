import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { creditBirthdays } from "@/app/api/admin/campaigns/_birthday-credits";
import { CAMPAIGN_BATCH_SIZE, dispatchCampaignBatch } from "@/app/api/admin/campaigns/_dispatch";

/**
 * The scheduled campaign dispatcher.
 *
 * WHY THIS EXISTS
 * ---------------
 * `campaigns.scheduled_at` was written by the admin panel and read by nothing.
 * There was no cron in this repo, no scheduler of any kind, and the birthday
 * campaign could only go out if somebody remembered to open the admin panel and
 * press a button on the right morning.
 *
 * WHO CALLS IT
 * ------------
 * A pg_cron job defined in `supabase/migrations/20260807_customer_merge_and_
 * schedule.sql`, using pg_net, with the bearer token held in Supabase Vault.
 * The schedule lives in the database rather than in a host crontab so it
 * survives the move to Vercel this deployment is heading for.
 *
 * WHY IT IS BUILT THE WAY IT IS
 * -----------------------------
 * pg_net is fire-and-forget. It queues the request, cannot see the response
 * body, cannot branch on an error and cannot retry. Everything below follows
 * from that:
 *
 *   - IDEMPOTENT. The work list is `campaign_recipients.sent_at is null`, and
 *     birthday points de-duplicate on `reward_ledger.source_key`. Running the
 *     same tick twice does nothing twice.
 *   - BOUNDED. One batch of at most 100 per campaign per tick, matching
 *     Resend's batch ceiling, and `{ sent, remaining }` comes back so the next
 *     tick has somewhere to start.
 *   - FREQUENT. Every fifteen minutes between 07:00 and 09:59 gives twelve
 *     attempts a morning, which is the only retry mechanism available. Ghana is
 *     UTC+0 year-round, so the cron expression needs no timezone conversion.
 */

export const dynamic = "force-dynamic";

/** Campaigns handled per tick, so one enormous list cannot starve the others. */
const MAX_CAMPAIGNS_PER_TICK = 5;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    // Refusing is the safe default: without a secret this endpoint would let
    // anyone on the internet mail the entire customer list.
    return NextResponse.json({ message: "Not found." }, { status: 404 });
  }
  if (!isAuthorized(request.headers.get("authorization"), secret)) {
    return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  }

  const now = new Date();

  // Points first. A parent should never read "we have added birthday points to
  // your rewards wallet" and find an empty wallet.
  let credits = { credited: 0, skipped: 0, total: 0 };
  let creditError: string | null = null;
  try {
    credits = await creditBirthdays(now);
  } catch (error) {
    creditError = error instanceof Error ? error.message : "Birthday credits failed.";
  }

  const { data: due, error: dueError } = await supabaseAdmin
    .from("campaigns")
    .select("id, name, campaign_type, scheduled_at")
    .eq("status", "ready")
    .not("scheduled_at", "is", null)
    .lte("scheduled_at", now.toISOString())
    .order("scheduled_at", { ascending: true })
    .limit(MAX_CAMPAIGNS_PER_TICK);
  if (dueError) {
    return NextResponse.json(
      { message: "Scheduled campaigns could not be read.", credits, creditError },
      { status: 500 },
    );
  }

  let sent = 0;
  let remaining = 0;
  const campaigns: {
    id: string;
    name: string;
    sent: number;
    remaining: number;
    simulated: boolean;
    message: string | null;
  }[] = [];

  for (const campaign of due || []) {
    try {
      const result = await dispatchCampaignBatch(
        campaign.id,
        campaign.campaign_type,
        CAMPAIGN_BATCH_SIZE,
      );
      sent += result.sent;
      remaining += result.remaining;
      campaigns.push({
        id: campaign.id,
        name: campaign.name,
        sent: result.sent,
        remaining: result.remaining,
        simulated: result.simulated,
        message: result.message,
      });
    } catch (error) {
      // One broken campaign must not stop the others; the next tick retries it.
      campaigns.push({
        id: campaign.id,
        name: campaign.name,
        sent: 0,
        remaining: 0,
        simulated: false,
        message: error instanceof Error ? error.message : "Dispatch failed.",
      });
    }
  }

  return NextResponse.json({ sent, remaining, campaigns, credits, creditError });
}

/**
 * Compare in constant time.
 *
 * `a === b` on a secret leaks its prefix through timing, and this endpoint is
 * publicly reachable and can be probed as often as an attacker likes.
 */
function isAuthorized(header: string | null, secret: string): boolean {
  const match = /^Bearer\s+(.+)$/i.exec(header || "");
  if (!match) return false;

  const provided = Buffer.from(match[1]!.trim());
  const expected = Buffer.from(secret);
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(provided, expected);
}
