import { NextResponse } from "next/server";
import { authorizeAdminApi } from "@/lib/auth";
import { isEmailDeliveryConfigured } from "@/lib/email";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { daysUntilBirthday } from "@/domain/admin-customers";
import { dedupeBirthdayCandidates, type BirthdayCandidate } from "@/domain/crm/birthday";
import {
  campaignTokens,
  CAMPAIGN_TOKENS,
  personalize,
  personalizeHtml,
  unresolvedTokens,
} from "@/domain/crm/campaign-send";
import { normalizeEmail } from "@/domain/crm/customer-identity";
import { campaignTemplate } from "../_dispatch";

/**
 * Everything the admin needs to decide whether to send, WITHOUT creating
 * anything.
 *
 * The old flow created a draft campaign row and only then asked whether there
 * were any recipients, so every click on "Build birthday campaign" left an
 * orphan draft behind — and there was no way to delete one. Preview first,
 * create on confirm.
 *
 * It also returns the rendered email. A non-technical shop owner had no way to
 * see what a parent would actually receive before it went out; the only
 * feedback was a count.
 */
export async function GET(request: Request) {
  const authorization = await authorizeAdminApi("customers:read");
  if (!authorization.authorized) return authorization.response;

  const daysAhead = clampDays(new URL(request.url).searchParams.get("days"));

  let recipients: BirthdayCandidate[];
  try {
    recipients = await loadBirthdayRecipients(daysAhead);
  } catch {
    return NextResponse.json({ message: "Recipients could not be built." }, { status: 500 });
  }

  const template = campaignTemplate("birthday");
  // Preview against a real recipient where there is one — a preview built from
  // invented data is exactly the preview that hides a missing name.
  const sample = recipients[0]
    ? campaignTokens({
        email: recipients[0].email,
        parentName: recipients[0].parentName,
        childName: recipients[0].childName,
        daysUntilBirthday: recipients[0].daysUntilBirthday,
      })
    : campaignTokens({ email: "", parentName: "Ama Mensah", childName: "Kojo", daysUntilBirthday: 7 });

  const html = personalizeHtml(template.html, sample);

  return NextResponse.json({
    daysAhead,
    count: recipients.length,
    recipients: recipients.map((recipient) => ({
      userId: recipient.userId,
      email: recipient.email,
      parentName: recipient.parentName,
      childName: recipient.childName,
      childDateOfBirth: recipient.childDateOfBirth,
      daysUntilBirthday: recipient.daysUntilBirthday,
    })),
    preview: {
      subject: personalize(template.subject, sample),
      html,
      sampledFrom: recipients[0]?.email || null,
      unresolved: unresolvedTokens(html),
    },
    tokens: CAMPAIGN_TOKENS,
    /**
     * Surfaced before the send rather than after it. Without a provider the
     * send is simulated, and the admin should know that while they can still
     * do something about it.
     */
    emailConfigured: isEmailDeliveryConfigured(),
  });
}

function clampDays(value: string | null): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 30;
  return Math.min(365, Math.max(0, Math.round(parsed)));
}

/**
 * The recipient list, from every place a child's birthday can live.
 *
 * The RPC alone is not enough, in both directions:
 *
 *   - The `build_birthday_campaign` that ships today reads ONLY
 *     `customer_children`, which is empty on this database — so it answers `[]`
 *     while `members` holds real children with real birthdays. Trusting it
 *     would show "no birthdays coming up" to a shop that has plenty.
 *   - It also builds the next birthday with `make_date(year, 2, 29)`, which
 *     RAISES in a common year. One leap-day child and the preview 500s.
 *
 * The migration fixes both. Until it is applied, the members half is computed
 * here instead, and `dedupeBirthdayCandidates` collapses the overlap either
 * way — so this stays correct after the migration rather than double-counting.
 */
async function loadBirthdayRecipients(daysAhead: number): Promise<BirthdayCandidate[]> {
  const [fromRpc, fromMembers] = await Promise.all([
    loadFromRpc(daysAhead),
    loadFromMembers(),
  ]);

  return dedupeBirthdayCandidates([...fromRpc, ...fromMembers]).filter(
    (candidate) => candidate.daysUntilBirthday <= daysAhead,
  );
}

async function loadFromRpc(daysAhead: number): Promise<BirthdayCandidate[]> {
  const { data, error } = await supabaseAdmin.rpc("build_birthday_campaign", {
    p_days_ahead: daysAhead,
  });
  if (!error && Array.isArray(data)) {
    return data.map((row: Record<string, unknown>) => ({
      userId: row.user_id ? String(row.user_id) : null,
      email: normalizeEmail(row.email),
      parentName: String(row.parent_name || ""),
      childName: String(row.child_name || ""),
      childDateOfBirth: row.child_date_of_birth ? String(row.child_date_of_birth) : null,
      daysUntilBirthday: Number(row.days_until_birthday || 0),
    }));
  }

  return loadFromChildren();
}

async function loadFromChildren(): Promise<BirthdayCandidate[]> {
  const { data: children } = await supabaseAdmin
    .from("customer_children")
    .select("user_id, first_name, date_of_birth")
    .not("date_of_birth", "is", null)
    .limit(2000);

  const userIds = [...new Set((children || []).map((child) => child.user_id))];
  const { data: profiles } = userIds.length
    ? await supabaseAdmin
        .from("customer_profiles")
        .select("user_id, email, full_name")
        .in("user_id", userIds)
    : { data: [] };
  const profileById = new Map((profiles || []).map((profile) => [profile.user_id, profile]));

  return (children || []).flatMap((child) => {
    const profile = profileById.get(child.user_id);
    const email = normalizeEmail(profile?.email);
    if (!email) return [];
    return [
      {
        userId: child.user_id,
        email,
        parentName: profile?.full_name || "",
        childName: child.first_name || "",
        childDateOfBirth: String(child.date_of_birth),
        daysUntilBirthday: daysUntilBirthday(String(child.date_of_birth)),
      },
    ];
  });
}

async function loadFromMembers(): Promise<BirthdayCandidate[]> {
  const { data: members, error } = await supabaseAdmin
    .from("members")
    .select("id, email, parent_name, child_first_name, child_date_of_birth")
    .not("child_date_of_birth", "is", null)
    .limit(2000);
  if (error) return [];

  return (members || []).flatMap((member) => {
    const email = normalizeEmail(member.email);
    if (!email) return [];
    return [
      {
        userId: null,
        email,
        parentName: member.parent_name || "",
        childName: member.child_first_name || "",
        childDateOfBirth: String(member.child_date_of_birth),
        daysUntilBirthday: daysUntilBirthday(String(member.child_date_of_birth)),
      },
    ];
  });
}
