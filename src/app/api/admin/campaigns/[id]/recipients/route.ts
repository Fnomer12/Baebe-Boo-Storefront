import { NextResponse } from "next/server";
import { authorizeAdminApi } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { recipientUpsertRows, type CampaignRecipient } from "@/domain/crm/campaign-send";
import { countRecipients } from "../../_dispatch";

/**
 * The recipients SAVED against this campaign.
 *
 * This used to return a freshly BUILT list from `build_birthday_campaign`,
 * which meant the one screen an admin could use to check "who is this actually
 * going to" never showed what had been saved. Building a candidate list is now
 * `GET /api/admin/campaigns/preview`, which creates nothing.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authorization = await authorizeAdminApi("customers:read");
  if (!authorization.authorized) return authorization.response;

  const { id } = await params;
  const { data, error } = await supabaseAdmin
    .from("campaign_recipients")
    .select("id, user_id, email, metadata, sent_at, created_at")
    .eq("campaign_id", id)
    .order("created_at", { ascending: true })
    .limit(1000);
  if (error) {
    return NextResponse.json({ message: "Recipients could not be loaded." }, { status: 500 });
  }

  return NextResponse.json({
    recipients: (data || []).map((row) => {
      const metadata = (row.metadata || {}) as Record<string, unknown>;
      return {
        id: row.id,
        userId: row.user_id,
        email: row.email,
        parentName: String(metadata.parent_name || ""),
        childName: String(metadata.child_name || ""),
        daysUntilBirthday:
          metadata.days_until_birthday === "" || metadata.days_until_birthday === undefined
            ? null
            : Number(metadata.days_until_birthday),
        sentAt: row.sent_at,
      };
    }),
    recipientCount: await countRecipients(id),
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authorization = await authorizeAdminApi("customers:write");
  if (!authorization.authorized) return authorization.response;

  const { id } = await params;

  const { data: campaign, error: campaignError } = await supabaseAdmin
    .from("campaigns")
    .select("id, status")
    .eq("id", id)
    .maybeSingle();
  if (campaignError) {
    return NextResponse.json({ message: "Campaign could not be loaded." }, { status: 500 });
  }
  if (!campaign) {
    return NextResponse.json({ message: "Campaign not found." }, { status: 404 });
  }
  if (campaign.status === "sent") {
    return NextResponse.json(
      { message: "This campaign has already been sent, so its list cannot be changed." },
      { status: 409 },
    );
  }

  let body: { recipients?: CampaignRecipient[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON body." }, { status: 400 });
  }

  const rows = recipientUpsertRows(id, Array.isArray(body?.recipients) ? body.recipients : []);
  if (rows.length === 0) {
    return NextResponse.json({ message: "No valid recipients provided." }, { status: 400 });
  }

  /**
   * `onConflict` is the mailbox, not the user.
   *
   * It used to be `"campaign_id, user_id"`, and `user_id` is nullable. NULL is
   * never equal to NULL in Postgres, so the constraint could not fire for
   * exactly the rows that duplicated — every save added another copy of every
   * recipient who had no account. The matching unique index lands in
   * 20260807_customer_merge_and_schedule.sql; until it does, the upsert falls
   * back to a plain insert of rows that are already de-duplicated in memory.
   */
  const { error } = await supabaseAdmin
    .from("campaign_recipients")
    .upsert(rows, { onConflict: "campaign_id,email", ignoreDuplicates: false });

  if (error) {
    if (!isMissingConflictTarget(error)) {
      return NextResponse.json({ message: "Recipients could not be saved." }, { status: 500 });
    }

    const { data: existing } = await supabaseAdmin
      .from("campaign_recipients")
      .select("email")
      .eq("campaign_id", id);
    const known = new Set((existing || []).map((row) => String(row.email || "").toLowerCase()));
    const fresh = rows.filter((row) => !known.has(row.email));

    if (fresh.length > 0) {
      const { error: insertError } = await supabaseAdmin.from("campaign_recipients").insert(fresh);
      if (insertError) {
        return NextResponse.json({ message: "Recipients could not be saved." }, { status: 500 });
      }
    }
  }

  const recipientCount = await countRecipients(id);
  await supabaseAdmin.from("campaigns").update({ audience_count: recipientCount }).eq("id", id);

  return NextResponse.json({ saved: rows.length, recipientCount });
}

/** PostgREST 42P10 when the (campaign_id, email) unique index is not there yet. */
function isMissingConflictTarget(error: { code?: string; message?: string }): boolean {
  return (
    error.code === "42P10" ||
    /no unique or exclusion constraint matching/i.test(error.message || "")
  );
}
