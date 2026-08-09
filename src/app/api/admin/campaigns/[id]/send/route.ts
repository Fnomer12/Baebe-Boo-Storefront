import { NextResponse } from "next/server";
import { authorizeAdminApi } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { CAMPAIGN_BATCH_SIZE, dispatchCampaignBatch } from "../../_dispatch";

/** Ten batches of 100 in one click; anything past that is left for the next press or the cron. */
const MAX_BATCHES_PER_REQUEST = 10;

/**
 * Send now, from the admin panel.
 *
 * The important change is what happens when the send does not really happen.
 * This route used to stamp `status = 'sent'` regardless of the result, and the
 * UI dropped the `simulated` flag, so a campaign that had gone precisely
 * nowhere was reported as delivered and its recipient list was closed off. It
 * now refuses to mark a simulated or rejected send as sent, says why, and
 * leaves every recipient on the work list.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authorization = await authorizeAdminApi("customers:write");
  if (!authorization.authorized) return authorization.response;

  const { id } = await params;

  const { data: campaign, error: campaignError } = await supabaseAdmin
    .from("campaigns")
    .select("id, status, campaign_type")
    .eq("id", id)
    .maybeSingle();
  if (campaignError) {
    return NextResponse.json({ message: "Campaign could not be loaded." }, { status: 500 });
  }
  if (!campaign) {
    return NextResponse.json({ message: "Campaign not found." }, { status: 404 });
  }
  if (campaign.status === "sent") {
    return NextResponse.json({ message: "Campaign has already been sent." }, { status: 409 });
  }
  if (campaign.status === "cancelled") {
    return NextResponse.json(
      { message: "This campaign was cancelled. Build a new one to send it." },
      { status: 409 },
    );
  }

  let sent = 0;
  let remaining = 0;
  let simulated = false;
  let message: string | null = null;
  let status = campaign.status;

  try {
    for (let batch = 0; batch < MAX_BATCHES_PER_REQUEST; batch += 1) {
      const result = await dispatchCampaignBatch(id, campaign.campaign_type, CAMPAIGN_BATCH_SIZE);
      sent += result.sent;
      remaining = result.remaining;
      simulated = result.simulated;
      message = result.message;
      status = result.status;
      if (result.sent === 0) break;
      if (result.remaining === 0) break;
    }
  } catch (sendError) {
    return NextResponse.json(
      { message: sendError instanceof Error ? sendError.message : "Campaign could not be sent." },
      { status: 502 },
    );
  }

  if (sent === 0 && message) {
    // 502 rather than 200: nothing was delivered, and a green tick here is the
    // exact lie this route existed to tell.
    return NextResponse.json({ id, sent, remaining, simulated, message }, { status: 502 });
  }

  return NextResponse.json({
    id,
    status,
    sent,
    remaining,
    simulated,
    message:
      remaining > 0
        ? `${sent} sent. ${remaining} still queued — they will go out on the next scheduled run, or press Send again.`
        : null,
  });
}
