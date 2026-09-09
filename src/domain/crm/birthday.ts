/**
 * Whose birthday is it, and when.
 *
 * WHY THIS EXISTS
 * ---------------
 * Two routes answered this question two different ways and both were wrong.
 *
 *   - `/api/admin/loyalty/birthday-credits` compared a `YYYY-MM-DD` string
 *     parsed as UTC midnight against `getMonth()`/`getDate()` — LOCAL getters.
 *     On any server west of UTC that reads back as the previous day, so every
 *     birthday credit fired 24 hours early, every year. It also read
 *     `customer_profiles.date_of_birth`, which is the PARENT's birthday, while
 *     the campaign that is supposed to accompany the credit uses the CHILD's.
 *   - The campaign counted days with `build_birthday_campaign` in SQL and the
 *     admin table counted them with `daysUntilBirthday` in TypeScript.
 *
 * Ghana is UTC+0 all year, so UTC is both correct and the local answer. That
 * makes all-UTC arithmetic the precedent to copy — it is already what
 * `src/domain/admin-customers.ts` does — rather than a compromise.
 */

/**
 * Is `dateOfBirth` (a `YYYY-MM-DD` date) a birthday on `now`?
 *
 * A 29 February child is credited on 28 February in a common year. The
 * alternative — exact month/day matching — silently skips them three years in
 * four, and "your loyalty points only arrive in leap years" is not a rule
 * anybody would choose on purpose.
 */
export function isBirthdayToday(dateOfBirth: string | null | undefined, now = new Date()): boolean {
  const parts = parseDateOnly(dateOfBirth);
  if (!parts) return false;

  const month = now.getUTCMonth() + 1;
  const day = now.getUTCDate();
  if (parts.month === month && parts.day === day) return true;

  const leapBorn = parts.month === 2 && parts.day === 29;
  return leapBorn && month === 2 && day === 28 && !isLeapYear(now.getUTCFullYear());
}

/**
 * The idempotency key for a birthday credit.
 *
 * `credit_loyalty_points` de-duplicates on `reward_ledger.source_key`, so this
 * string is the whole reason the cron can run every fifteen minutes for three
 * hours without paying a customer twelve times. The year is part of the key
 * and nothing else is: the same person, same birthday, same year is one credit
 * however many times we ask.
 */
export function birthdayCreditSourceKey(userId: string, now = new Date()): string {
  return `birthday:${now.getUTCFullYear()}:${userId}`;
}

/** `YYYY-MM-DD` → parts, in UTC, or `null` for anything that is not a date. */
function parseDateOnly(value: string | null | undefined): { year: number; month: number; day: number } | null {
  if (typeof value !== "string") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  // Round-trip through Date to reject 31 February and friends.
  const asDate = new Date(Date.UTC(year, month - 1, day));
  if (asDate.getUTCMonth() + 1 !== month || asDate.getUTCDate() !== day) return null;

  return { year, month, day };
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export type BirthdayCandidate = {
  userId: string | null;
  email: string;
  phone?: string | null;
  parentName: string;
  childName: string;
  childDateOfBirth: string | null;
  daysUntilBirthday: number;
};

/**
 * Collapse candidates that arrive from more than one source.
 *
 * Children live in `customer_children` for anyone with an account and in
 * `members` for anyone who only ever filled in the homepage form, and the
 * backfill copies one into the other. During the window where both hold the
 * same child, the parent must still receive one email, not two — and after it,
 * a parent of twins must still receive one email rather than two identical
 * ones on the same day.
 *
 * Identity is the parent's mailbox plus the child's birthday. Sorting is by
 * how soon the birthday is, so a bounded batch takes the most urgent first.
 */
export function dedupeBirthdayCandidates(
  candidates: readonly BirthdayCandidate[],
): BirthdayCandidate[] {
  const byKey = new Map<string, BirthdayCandidate>();

  for (const candidate of candidates) {
    const email = candidate.email.trim().toLowerCase();
    if (!email) continue;
    const key = `${email}|${candidate.childDateOfBirth || candidate.childName.trim().toLowerCase()}`;
    const existing = byKey.get(key);
    // Prefer the row that knows the account: it is the one that can be credited.
    // Preserve a phone number when one source has it and the other does not.
    if (!existing || (!existing.userId && candidate.userId)) {
      byKey.set(key, { ...candidate, email, phone: candidate.phone || existing?.phone || null });
    } else if (!existing.phone && candidate.phone) {
      byKey.set(key, { ...existing, phone: candidate.phone });
    }
  }

  return [...byKey.values()].sort(
    (first, second) => first.daysUntilBirthday - second.daysUntilBirthday,
  );
}
