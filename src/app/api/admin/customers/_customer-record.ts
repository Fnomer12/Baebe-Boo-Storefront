import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  chooseCanonicalProfile,
  escapeLikePattern,
  normalizeEmail,
  type MemberRow,
  type ProfileRow,
} from "@/domain/crm/customer-identity";

/**
 * One customer, resolved from whichever of the two tables the caller had an id for.
 *
 * `customer_profiles` is the source of truth from here on: it is what the CSV
 * export beside the customer table reads (`report_top_customers` is built from
 * it), it is what orders, points, addresses and returns hang off, and it is the
 * only one of the two that exists for a customer who signed in and shopped
 * without ever filling in the homepage form.
 *
 * `members` rows are still read, for two reasons. Until
 * `scripts/backfill-customer-merge.mjs` has run, they are the only place a lead
 * exists at all, and dropping them from the screen would swap one invisible
 * half of the customer base for the other. And they carry `member_code` and the
 * child's date of birth, which the profile does not.
 */

const MEMBER_COLUMNS =
  "id, member_code, parent_name, child_first_name, child_last_name, phone, email, child_date_of_birth, created_at";

const PROFILE_COLUMNS =
  "user_id, email, full_name, phone, date_of_birth, marketing_status, created_at, updated_at";

/**
 * `members.user_id` arrives with 20260807_customer_merge_and_schedule.sql.
 *
 * Selecting a column that does not exist is a 400 from PostgREST, not an empty
 * result, so asking for it before the migration is applied would take the whole
 * customers screen down. The answer is remembered, but a NEGATIVE answer only
 * for a few minutes: the migration is applied by a human against a running
 * server, and caching "the column is not there" for the life of the process
 * would mean the merge quietly did nothing until someone thought to redeploy.
 */
let membersHaveUserId: boolean | null = null;
let membersProbedAt = 0;
const MEMBER_SCHEMA_RECHECK_MS = 5 * 60_000;

export type MemberFilter = {
  ids?: readonly string[];
  emails?: readonly string[];
  userIds?: readonly string[];
};

/**
 * Members are read a page at a time, like `loadProfiles`.
 *
 * A flat `.limit(2000)` is the same silent truncation `loadProfiles` was
 * rewritten to avoid, just applied to the other half of the customer base: the
 * 2001st lead is not a slow page, it is a customer who does not exist as far as
 * the shop is concerned — missing from the list, missing from a birthday
 * campaign, and un-findable by search. The page cap is a runaway guard, not a
 * business limit; hitting it is a bug, not a big shop.
 */
const MEMBER_PAGE_SIZE = 1000;
const MAX_MEMBER_PAGES = 20;

export async function loadMembers(filter: MemberFilter = {}): Promise<MemberRow[]> {
  if (filter.ids?.length === 0 || filter.emails?.length === 0) return [];
  if (filter.userIds?.length === 0) return [];

  function page(withUserId: boolean, index: number) {
    let query = supabaseAdmin
      .from("members")
      .select(withUserId ? `${MEMBER_COLUMNS}, user_id` : MEMBER_COLUMNS)
      .order("created_at", { ascending: false })
      .range(index * MEMBER_PAGE_SIZE, index * MEMBER_PAGE_SIZE + MEMBER_PAGE_SIZE - 1);

    if (filter.ids) query = query.in("id", filter.ids as string[]);
    if (filter.emails) query = query.in("email", filter.emails as string[]);
    if (filter.userIds && withUserId) query = query.in("user_id", filter.userIds as string[]);

    return query;
  }

  /**
   * Every page, or an error.
   *
   * The `user_id` probe is only meaningful on the FIRST page: once one page has
   * come back the column question is settled, and a later page failing is a
   * real failure rather than a schema answer.
   */
  async function readAll(withUserId: boolean): Promise<
    { rows: MemberRow[]; error: null } | { rows: null; error: { code?: string; message?: string } }
  > {
    const rows: MemberRow[] = [];
    for (let index = 0; index < MAX_MEMBER_PAGES; index += 1) {
      const { data, error } = await page(withUserId, index);
      if (error) return { rows: null, error };

      const batch = (data || []) as unknown as MemberRow[];
      rows.push(...batch);
      if (batch.length < MEMBER_PAGE_SIZE) break;
    }
    return { rows, error: null };
  }

  const staleNegative =
    membersHaveUserId === false && Date.now() - membersProbedAt > MEMBER_SCHEMA_RECHECK_MS;

  if (membersHaveUserId !== false || staleNegative) {
    const { rows, error } = await readAll(true);
    if (!error) {
      membersHaveUserId = true;
      membersProbedAt = Date.now();
      return rows;
    }
    // Anything other than "that column is not there" is a real failure and
    // should not be papered over by a second query that hides the cause.
    if (!isMissingColumn(error)) throw new Error(error.message || "Members could not be loaded.");
    membersHaveUserId = false;
    membersProbedAt = Date.now();
  }

  // The pre-migration shape cannot answer a user_id filter at all.
  if (filter.userIds) return [];

  const { rows, error } = await readAll(false);
  if (error) throw new Error(error.message || "Members could not be loaded.");
  return rows.map((row) => ({ ...row, user_id: null }));
}

function isMissingColumn(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  // 42703 is Postgres "undefined column"; PostgREST also answers PGRST204 for
  // a column missing from its cached schema.
  return error.code === "42703" || error.code === "PGRST204" || /column .* does not exist/i.test(error.message || "");
}

/**
 * Find the profile for an address.
 *
 * `ilike` with the wildcards escaped is a case-insensitive exact match, which
 * is what every call site meant. The unescaped version really did match the
 * wrong customer: a lookup for `hijackermills_7@gmail.com` returns the row for
 * `hijackermills07@gmail.com` on this database today.
 *
 * `maybeSingle()` is deliberately not used — it throws when two rows match,
 * which turned a duplicate account into a 500 on the detail panel instead of
 * showing either one.
 */
export async function findProfileByEmail(email: string): Promise<ProfileRow | null> {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;

  const { data, error } = await supabaseAdmin
    .from("customer_profiles")
    .select(PROFILE_COLUMNS)
    .ilike("email", escapeLikePattern(normalized))
    .limit(20);
  if (error) return null;

  return chooseCanonicalProfile((data || []) as ProfileRow[], normalized);
}

export type ResolvedCustomer = {
  /** The id the caller used. Stable, so admin links keep working. */
  id: string;
  userId: string | null;
  email: string;
  profile: ProfileRow | null;
  members: MemberRow[];
};

/**
 * Resolve `id` as either a `customer_profiles.user_id` or a legacy
 * `members.id`.
 *
 * Both are accepted because the customer list used to be keyed on members.id,
 * so every link an admin has open in another tab — and every bookmark — is a
 * members id. Returning the same customer for both is cheaper than breaking
 * them, and after the backfill the two converge anyway.
 */
export async function resolveCustomer(id: string): Promise<ResolvedCustomer | null> {
  const { data: profileRow } = await supabaseAdmin
    .from("customer_profiles")
    .select(PROFILE_COLUMNS)
    .eq("user_id", id)
    .maybeSingle();

  if (profileRow) {
    const profile = profileRow as ProfileRow;
    const email = normalizeEmail(profile.email);
    return {
      id,
      userId: profile.user_id,
      email,
      profile,
      members: await membersForCustomer(profile.user_id, email),
    };
  }

  const memberRows = await loadMembers({ ids: [id] });
  const member = memberRows[0];
  if (!member) return null;

  const email = normalizeEmail(member.email);
  const profile = member.user_id
    ? await profileByUserId(member.user_id)
    : await findProfileByEmail(email);

  return {
    id,
    userId: profile?.user_id ?? member.user_id ?? null,
    email,
    profile,
    members: profile ? await membersForCustomer(profile.user_id, email) : memberRows,
  };
}

async function profileByUserId(userId: string): Promise<ProfileRow | null> {
  const { data } = await supabaseAdmin
    .from("customer_profiles")
    .select(PROFILE_COLUMNS)
    .eq("user_id", userId)
    .maybeSingle();
  return (data as ProfileRow) || null;
}

/** Every members row belonging to one customer, by link or by address. */
async function membersForCustomer(userId: string, email: string): Promise<MemberRow[]> {
  const [linked, byEmail] = await Promise.all([
    loadMembers({ userIds: [userId] }),
    email ? loadMembers({ emails: [email] }) : Promise.resolve([]),
  ]);

  const seen = new Set<string>();
  return [...linked, ...byEmail].filter((row) => {
    if (seen.has(row.id)) return false;
    seen.add(row.id);
    return true;
  });
}
