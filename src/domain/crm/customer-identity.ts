/**
 * The rules that turn two half-customers into one.
 *
 * WHY THIS EXISTS
 * ---------------
 * Baebe Boo has kept customers in two places that never met:
 *
 *   - `public.members` — the homepage "Join the family" form. Parent name,
 *     child name, phone, email, child's date of birth. No `user_id`, no auth
 *     user, no orders.
 *   - `public.customer_profiles` — created by the `bootstrap_customer_account`
 *     trigger the first time somebody signs in. Email, full name, phone, and
 *     the PARENT's date of birth, plus `customer_children` alongside it.
 *
 * They were joined by loose email matching at read time, with three separate
 * consequences that all showed up on one admin screen:
 *
 *   1. A customer who signs in and shops never appears in admin at all unless
 *      they ALSO filled in the homepage form.
 *   2. The customer table read `members` while the CSV export button beside it
 *      read `report_top_customers`, which is built from `customer_profiles`.
 *      The same screen contradicted itself.
 *   3. The list route matched with exact `.in("email", …)` while the detail
 *      routes used `.ilike(email).maybeSingle()`. `ilike` treats `%` and `_`
 *      as wildcards — verified against production, where a lookup for
 *      `hijackermills_7@gmail.com` returned `hijackermills07@gmail.com` — and
 *      `maybeSingle()` throws outright when two profiles match.
 *
 * Everything here is pure so the merge can be argued about in tests rather
 * than discovered on production data that cannot be un-merged.
 */

export type MemberRow = {
  id: string;
  email: string | null;
  /** The card number the shop hands out. Only `members` has it. */
  member_code?: string | null;
  parent_name: string | null;
  child_first_name: string | null;
  child_last_name: string | null;
  phone: string | null;
  child_date_of_birth: string | null;
  created_at?: string | null;
  /** Added by 20260807_customer_merge_and_schedule.sql; absent before it runs. */
  user_id?: string | null;
};

export type ProfileRow = {
  user_id: string;
  email: string | null;
  full_name: string | null;
  phone: string | null;
  date_of_birth: string | null;
  created_at?: string | null;
};

export type ChildRow = {
  first_name: string | null;
  date_of_birth: string | null;
};

/** Lower-cased, trimmed, and never `null`. The only form an email is compared in. */
export function normalizeEmail(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

/**
 * Make a value safe to hand to PostgREST's `ilike` as a literal.
 *
 * Postgres `LIKE` treats `%` and `_` as wildcards and uses backslash as the
 * default escape character, so escaping here turns `ilike` into what every
 * call site already assumed it was: a case-insensitive exact match. Both
 * characters are legal in the local part of an email address, so this is not
 * hypothetical — see the module comment.
 *
 * The backslash itself is escaped first, or `a\b` would eat the escape we add
 * for a following wildcard.
 */
export function escapeLikePattern(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

/**
 * Pick one profile when an email lookup returns several.
 *
 * `maybeSingle()` answers this question by throwing, which turned a duplicate
 * — two auth users whose addresses differ only in case, say — into a 500 on
 * the customer detail panel. Oldest wins: it is the account that accumulated
 * the orders and the points, and it is stable, so two requests never disagree
 * about which record they are showing.
 */
export function chooseCanonicalProfile(
  candidates: readonly ProfileRow[],
  email?: string,
): ProfileRow | null {
  if (candidates.length === 0) return null;

  // Byte-identical beats case-variant: `ilike` is what returned both, so the
  // row that is literally the address we asked for is the better guess.
  const wanted = (email || "").trim();
  const exact = wanted
    ? candidates.filter((row) => (row.email || "").trim() === wanted)
    : [];
  const pool = exact.length > 0 ? exact : [...candidates];

  return [...pool].sort((first, second) => {
    const firstAt = Date.parse(first.created_at || "") || Number.MAX_SAFE_INTEGER;
    const secondAt = Date.parse(second.created_at || "") || Number.MAX_SAFE_INTEGER;
    if (firstAt !== secondAt) return firstAt - secondAt;
    return first.user_id.localeCompare(second.user_id);
  })[0]!;
}

/** `"Kojo" + "Mensah"` → `"Kojo Mensah"`, without a stray space when half is missing. */
export function fullChildName(member: Pick<MemberRow, "child_first_name" | "child_last_name">): string {
  return [member.child_first_name, member.child_last_name]
    .map((part) => (part || "").trim())
    .filter(Boolean)
    .join(" ");
}

export type MergeAction =
  /** The member's email already has an auth user — just point the row at it. */
  | { kind: "link"; memberId: string; email: string; userId: string }
  /** No auth user for this email yet; the backfill mints one. */
  | { kind: "create"; memberId: string; email: string }
  /** Already linked, or unusable. Nothing to do. */
  | { kind: "skip"; memberId: string; email: string; reason: "already-linked" | "no-email" };

export type MergePlan = {
  actions: MergeAction[];
  /** Distinct emails that need an auth user minting. */
  createEmails: string[];
};

/**
 * Decide, for every `members` row, whether it links to an existing account,
 * needs one created, or should be left alone.
 *
 * Grouping by email matters: a parent with three children has three `members`
 * rows and must end up with ONE auth user, not three. The plan therefore
 * reports distinct emails to create, while every row still gets its own link
 * action once the user exists.
 */
export function planCustomerMerge(
  members: readonly MemberRow[],
  profiles: readonly ProfileRow[],
): MergePlan {
  const profilesByEmail = new Map<string, ProfileRow[]>();
  for (const profile of profiles) {
    const email = normalizeEmail(profile.email);
    if (!email) continue;
    const bucket = profilesByEmail.get(email);
    if (bucket) bucket.push(profile);
    else profilesByEmail.set(email, [profile]);
  }

  const actions: MergeAction[] = [];
  const createEmails: string[] = [];
  const seenCreate = new Set<string>();

  for (const member of members) {
    const email = normalizeEmail(member.email);
    if (!email) {
      actions.push({ kind: "skip", memberId: member.id, email: "", reason: "no-email" });
      continue;
    }
    if (member.user_id) {
      actions.push({ kind: "skip", memberId: member.id, email, reason: "already-linked" });
      continue;
    }

    const match = chooseCanonicalProfile(profilesByEmail.get(email) || [], email);
    if (match) {
      actions.push({ kind: "link", memberId: member.id, email, userId: match.user_id });
      continue;
    }

    actions.push({ kind: "create", memberId: member.id, email });
    if (!seenCreate.has(email)) {
      seenCreate.add(email);
      createEmails.push(email);
    }
  }

  return { actions, createEmails };
}

/**
 * What of the member row belongs on the profile.
 *
 * Fills blanks only. The profile is the record the customer maintains
 * themselves from `/account`, and a marketing lead captured on the homepage
 * two years ago must not overwrite a phone number they corrected last week.
 * Returns `{}` when there is nothing to copy, so callers can skip the write.
 *
 * `date_of_birth` is deliberately absent: on `customer_profiles` that column
 * is the PARENT's birthday, and `members.child_date_of_birth` is the CHILD's.
 * Copying one into the other is the bug that made the loyalty birthday credit
 * fire on the wrong person — the child's date belongs in `customer_children`.
 */
export function profileUpdatesFromMember(
  member: MemberRow,
  profile: Pick<ProfileRow, "full_name" | "phone">,
): { full_name?: string; phone?: string } {
  const updates: { full_name?: string; phone?: string } = {};

  const parentName = (member.parent_name || "").trim();
  if (parentName && !(profile.full_name || "").trim()) {
    updates.full_name = parentName;
  }

  const phone = (member.phone || "").trim();
  if (phone && !(profile.phone || "").trim()) {
    updates.phone = phone;
  }

  return updates;
}

/** The `customer_children` row a member represents, or `null` when it holds no child. */
export function childFromMember(member: MemberRow): ChildRow | null {
  const firstName = (member.child_first_name || "").trim();
  const dateOfBirth = (member.child_date_of_birth || "").trim();
  if (!firstName && !dateOfBirth) return null;
  return {
    first_name: firstName || null,
    date_of_birth: dateOfBirth || null,
  };
}

/**
 * Every child a customer has, from both tables, each one once.
 *
 * `customer_children` is where children end up; `members` is where they still
 * are for any lead the backfill has not converted. A parent who filled in the
 * homepage form AND has an account is in both, and the admin panel showing
 * "Kojo" twice would read as a data-entry mistake nobody made.
 */
export function collectChildren(
  children: readonly ChildRow[],
  members: readonly MemberRow[],
): ChildRow[] {
  const collected: ChildRow[] = [];

  for (const child of children) {
    if (!childAlreadyRecorded(collected, child)) collected.push(child);
  }
  for (const member of members) {
    const child = childFromMember(member);
    if (child && !childAlreadyRecorded(collected, child)) collected.push(child);
  }

  return collected;
}

/**
 * Is this child already on file?
 *
 * The backfill is expected to be run more than once — `--dry-run` is the
 * default, so the first real run always follows at least one rehearsal — and a
 * parent who re-submits the homepage form must not gain a second copy of the
 * same child. Date of birth is the identity when present, because a nickname
 * ("Kojo" vs "Kojo Jnr") changes and a birthday does not.
 */
export function childAlreadyRecorded(
  existing: readonly ChildRow[],
  candidate: ChildRow,
): boolean {
  const candidateDob = (candidate.date_of_birth || "").trim();
  const candidateName = (candidate.first_name || "").trim().toLowerCase();

  return existing.some((child) => {
    const dob = (child.date_of_birth || "").trim();
    const name = (child.first_name || "").trim().toLowerCase();
    if (candidateDob && dob) return dob === candidateDob;
    return Boolean(candidateName) && name === candidateName;
  });
}
