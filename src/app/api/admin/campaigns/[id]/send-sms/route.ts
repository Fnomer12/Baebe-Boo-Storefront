import { NextResponse } from "next/server";
import { authorizeAdminApi } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { CAMPAIGN_BATCH_SIZE, dispatchSmsCampaignBatch } from "../../_dispatch";

const MAX_BATCHES_PER_REQUEST = 10;

/** Send the SMS channel for an existing campaign. */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authorization = await authorizeAdminApi("customers:write");
  if (!authorization.authorized) return authorization.response;
  const { id } = await params;

  const { data: campaign, error } = await supabaseAdmin
    .from("campaigns")
    .select("id, campaign_type")
    .eq("id", id)
    .maybeSingle();
  if (error) return NextResponse.json({ message: "Campaign could not be loaded." }, { status: 500 });
  if (!campaign) return NextResponse.json({ message: "Campaign not found." }, { status: 404 });

  let sent = 0;
  let remaining = 0;
  let simulated = false;
  let message: string | null = null;
  try {
    for (let batch = 0; batch < MAX_BATCHES_PER_REQUEST; batch += 1) {
      const result = await dispatchSmsCampaignBatch(id, campaign.campaign_type, CAMPAIGN_BATCH_SIZE);
      sent += result.sent;
      remaining = result.remaining;
      simulated = result.simulated;
      message = result.message;
      if (result.sent === 0 || result.remaining === 0) break;
    }
  } catch (sendError) {
    return NextResponse.json(
      { message: sendError instanceof Error ? sendError.message : "SMS campaign could not be sent." },
      { status: 502 },
    );
  }

  if (sent === 0 && message) {
    return NextResponse.json({ id, sent, remaining, simulated, message }, { status: 502 });
  }
  return NextResponse.json({
    id,
    sent,
    remaining,
    simulated,
    message: remaining > 0
      ? `${sent} SMS sent. ${remaining} still queued — press Send SMS again to retry.`
      : message,
  });
}
