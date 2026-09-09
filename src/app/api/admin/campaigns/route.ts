import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeAdminApi } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { fieldErrors, isoDateTimeSchema } from "@/lib/admin/schema-helpers";

/**
 * `vaccination`, `reengagement` and `custom` are gone from this schema.
 *
 * The database still allows them and old rows keep working, but nothing could
 * ever build an audience for them: `campaigns/[id]/recipients` answers 400 for
 * any type other than `birthday`. Offering a customer three choices that cannot
 * be completed is worse than offering one that can.
 */
const campaignTypes = ["birthday"] as const;

const createSchema = z.object({
  name: z.string().trim().min(1, "Give the campaign a name.").max(200),
  campaign_type: z.enum(campaignTypes, "Only birthday campaigns can be built right now."),
  scheduled_at: isoDateTimeSchema,
  /** `ready` hands the campaign to the scheduled dispatcher; `draft` does not. */
  status: z.enum(["draft", "ready"]).default("draft"),
});

export async function GET() {
  const authorization = await authorizeAdminApi("customers:read");
  if (!authorization.authorized) return authorization.response;

  const { data: campaigns, error } = await supabaseAdmin
    .from("campaigns")
    .select("id, name, campaign_type, status, scheduled_at, sent_at, audience_count, created_at, updated_at")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) {
    return NextResponse.json({ message: "Campaigns could not be loaded." }, { status: 500 });
  }

  const rows = campaigns || [];

  /**
   * Counting was done by fetching every recipient row and tallying them in
   * JavaScript, under PostgREST's 1000-row ceiling — so any campaign past a
   * thousand recipients under-reported, and every campaign paid for the whole
   * recipient table being dragged across the wire. `head: true` asks Postgres
   * for the number and transfers no rows.
   */
  const counts = await Promise.all(
    rows.map(async (campaign) => {
      const [total, pending, smsPending] = await Promise.all([
        supabaseAdmin
          .from("campaign_recipients")
          .select("*", { count: "exact", head: true })
          .eq("campaign_id", campaign.id),
        supabaseAdmin
          .from("campaign_recipients")
          .select("*", { count: "exact", head: true })
          .eq("campaign_id", campaign.id)
          .is("sent_at", null),
        supabaseAdmin
          .from("campaign_recipients")
          .select("*", { count: "exact", head: true })
          .eq("campaign_id", campaign.id)
          .is("sms_sent_at", null),
      ]);
      return {
        id: campaign.id,
        total: total.count || 0,
        pending: pending.count || 0,
        smsPending: smsPending.count || 0,
      };
    }),
  );
  const countById = new Map(counts.map((row) => [row.id, row]));

  const lastErrors = await loadLastErrors(rows.map((campaign) => campaign.id));

  return NextResponse.json({
    campaigns: rows.map((campaign) => {
      const count = countById.get(campaign.id);
      return {
        id: campaign.id,
        name: campaign.name,
        campaignType: campaign.campaign_type,
        status: campaign.status,
        scheduledAt: campaign.scheduled_at,
        sentAt: campaign.sent_at,
        audienceCount: campaign.audience_count || 0,
        recipientCount: count?.total || 0,
        pendingCount: count?.pending || 0,
        smsPendingCount: count?.smsPending || 0,
        lastError: lastErrors.get(campaign.id) || null,
        createdAt: campaign.created_at,
        updatedAt: campaign.updated_at,
      };
    }),
  });
}

export async function POST(request: Request) {
  const authorization = await authorizeAdminApi("customers:write");
  if (!authorization.authorized) return authorization.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { message: "Check the highlighted fields.", errors: fieldErrors(parsed.error) },
      { status: 400 },
    );
  }

  if (parsed.data.status === "ready" && !parsed.data.scheduled_at) {
    return NextResponse.json(
      {
        message: "Check the highlighted fields.",
        errors: { scheduled_at: "Pick a send date, or save it as a draft instead." },
      },
      { status: 400 },
    );
  }

  const { data: campaign, error } = await supabaseAdmin
    .from("campaigns")
    .insert({
      name: parsed.data.name,
      campaign_type: parsed.data.campaign_type,
      status: parsed.data.status,
      scheduled_at: parsed.data.scheduled_at || null,
      created_by: authorization.admin.userId,
    })
    .select("id, name, campaign_type, status, scheduled_at, sent_at, audience_count, created_at, updated_at")
    .single();
  if (error) {
    return NextResponse.json({ message: "Campaign could not be created." }, { status: 500 });
  }

  return NextResponse.json({ campaign }, { status: 201 });
}

/** `last_error` arrives with 20260807_customer_merge_and_schedule.sql. */
async function loadLastErrors(ids: readonly string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const { data, error } = await supabaseAdmin
    .from("campaigns")
    .select("id, last_error")
    .in("id", ids as string[]);
  if (error) return new Map();
  return new Map(
    (data || [])
      .filter((row) => row.last_error)
      .map((row) => [String(row.id), String(row.last_error)]),
  );
}
