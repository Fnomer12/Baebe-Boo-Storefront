import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";
import { birthdayCreditSourceKey, isBirthdayToday } from "@/domain/crm/birthday";
import { normalizeEmail } from "@/domain/crm/customer-identity";

/**
 * Award birthday loyalty points.
 *
 * Three things were wrong with the route that used to hold this:
 *
 *   1. It read `customer_profiles.date_of_birth` — the PARENT's birthday —
 *      while the campaign that is supposed to arrive alongside the points uses
 *      the CHILD's. The parent got points on their own birthday and the child's
 *      birthday email arrived with nothing attached to it.
 *   2. It compared a `YYYY-MM-DD` parsed as UTC midnight against local
 *      `getMonth()`/`getDate()`, so on any server west of UTC every credit
 *      fired a day early. `isBirthdayToday` is all-UTC, which is also Accra
 *      time all year round.
 *   3. Nothing called it. It had no caller anywhere in the repo — it was an
 *      endpoint waiting for a scheduler that did not exist. The cron route now
 *      runs it on every tick.
 *
 * It lives next to the campaign dispatcher because both are driven by the same
 * scheduled request and a route file cannot export anything but HTTP handlers.
 */

export type BirthdayCreditResult = {
  credited: number;
  skipped: number;
  total: number;
};

export async function creditBirthdays(now = new Date()): Promise<BirthdayCreditResult> {
  const birthdayUserIds = new Set<string>();

  const { data: children, error } = await supabaseAdmin
    .from("customer_children")
    .select("user_id, date_of_birth")
    .not("date_of_birth", "is", null)
    .limit(5000);
  if (error) throw new Error(error.message);

  for (const child of children || []) {
    if (isBirthdayToday(child.date_of_birth ? String(child.date_of_birth) : null, now)) {
      birthdayUserIds.add(child.user_id);
    }
  }

  // Leads whose child lives on a members row still count, as long as the
  // parent has an account for the points to land in. Before
  // scripts/backfill-customer-merge.mjs runs, that is most of them.
  for (const userId of await birthdayUserIdsFromMembers(now)) {
    birthdayUserIds.add(userId);
  }

  let credited = 0;
  let skipped = 0;

  for (const userId of birthdayUserIds) {
    // credit_loyalty_points de-duplicates on reward_ledger.source_key, so a
    // fifteen-minute cron across a three-hour window pays exactly once.
    const { error: creditError } = await supabaseAdmin.rpc("credit_loyalty_points", {
      p_user_id: userId,
      p_event_type: "birthday",
      p_source_key: birthdayCreditSourceKey(userId, now),
      p_reason: `Birthday reward for ${now.getUTCFullYear()}`,
      p_metadata: { year: now.getUTCFullYear(), credited_at: now.toISOString() },
    });

    if (creditError) skipped += 1;
    else credited += 1;
  }

  return { credited, skipped, total: birthdayUserIds.size };
}

async function birthdayUserIdsFromMembers(now: Date): Promise<string[]> {
  const { data: members, error } = await supabaseAdmin
    .from("members")
    .select("email, child_date_of_birth")
    .not("child_date_of_birth", "is", null)
    .limit(5000);
  if (error) return [];

  const emails = [
    ...new Set(
      (members || [])
        .filter((member) => isBirthdayToday(String(member.child_date_of_birth), now))
        .map((member) => normalizeEmail(member.email))
        .filter(Boolean),
    ),
  ];
  if (emails.length === 0) return [];

  const { data: profiles } = await supabaseAdmin
    .from("customer_profiles")
    .select("user_id, email")
    .in("email", emails);

  return (profiles || []).map((profile) => profile.user_id);
}
