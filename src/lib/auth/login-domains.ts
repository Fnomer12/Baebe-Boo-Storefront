/**
 * Where staff sign in.
 *
 * WHY THIS EXISTS
 * ---------------
 * Neither a cashier nor an admin has a mailbox of their own, so their sign-in
 * address is *derived* rather than collected — from a CounterID at the till,
 * from a short username in the admin portal. That derivation was copy-pasted
 * into five places (both login pages, the credential provisioner, the customer
 * login-code guard, and a SQL predicate). Any one of them drifting locks real
 * people out in a way that looks like a wrong password, because the address the
 * login page computes has to match, byte for byte, the address
 * `staff_authorizations` and `auth.users` were provisioned with.
 *
 * So it lives here once, and every caller derives it the same way.
 *
 * THE `.local` PROBLEM
 * --------------------
 * The original suffix was `@counter.baebe-boo.local`. RFC 6762 reserves
 * `.local` for multicast DNS, which made it a tidy way to say "nothing can ever
 * be delivered here" — but it is also not a domain this business owns or can
 * ever prove, and Supabase/GoTrue is entitled to reject it. Staff addresses are
 * now derived from the real site host instead.
 *
 * Existing cashiers and admins were provisioned under the old suffix, so
 * `staffLoginDomains()` deliberately keeps the legacy pair alive and the login
 * pages try both. Nobody is locked out mid-transition; the backfill script
 * (`scripts/backfill-staff-login-domain.mjs`) moves them across, and the legacy
 * entries can be dropped once it has run everywhere.
 *
 * Isomorphic on purpose: the two login pages are client components, so this
 * file must not import `server-only`. `process.env.NEXT_PUBLIC_SITE_URL` is
 * read as a literal member expression because that is the only form Next
 * inlines into a client bundle.
 */

/** Used when `NEXT_PUBLIC_SITE_URL` is unset — matches the app's other fallbacks. */
const FALLBACK_SITE_HOST = "baebe-boo.jtechinnovations.tech";

/** The host every staff login was provisioned under before this module existed. */
const LEGACY_SITE_HOST = "baebe-boo.local";

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

/**
 * The bare host of a configured site URL.
 *
 * Exported for tests, and tolerant on purpose: a misconfigured
 * `NEXT_PUBLIC_SITE_URL` must not be able to move every staff sign-in address
 * to a domain nobody was provisioned under. Anything unparseable falls back to
 * the known host rather than throwing.
 */
export function hostFromSiteUrl(value: string | null | undefined): string {
  const raw = (value ?? "").trim();
  if (!raw) return FALLBACK_SITE_HOST;

  // Accept a bare host ("baebe-boo.example") as readily as a full URL.
  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const host = new URL(candidate).hostname.toLowerCase();
    // `www.` is a storefront convention, not part of the mail domain — leaving
    // it in would make www and apex derive two different sign-in addresses.
    const bare = host.startsWith("www.") ? host.slice(4) : host;
    return bare || FALLBACK_SITE_HOST;
  } catch {
    return FALLBACK_SITE_HOST;
  }
}

export function siteHost(): string {
  return hostFromSiteUrl(process.env.NEXT_PUBLIC_SITE_URL);
}

export function counterLoginDomain(): string {
  return `counter.${siteHost()}`;
}

export function adminLoginDomain(): string {
  return `admin.${siteHost()}`;
}

export const legacyCounterLoginDomain = `counter.${LEGACY_SITE_HOST}`;
export const legacyAdminLoginDomain = `admin.${LEGACY_SITE_HOST}`;

/** Current first, legacy second — the order the login pages try them in. */
export function counterLoginDomains(): string[] {
  return unique([counterLoginDomain(), legacyCounterLoginDomain]);
}

export function adminLoginDomains(): string[] {
  return unique([adminLoginDomain(), legacyAdminLoginDomain]);
}

export function staffLoginDomains(): string[] {
  return unique([...adminLoginDomains(), ...counterLoginDomains()]);
}

function normalize(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

/** The address a CounterID maps to today. New logins are always provisioned here. */
export function counterEmailForCode(staffCode: string): string {
  return `${normalize(staffCode)}@${counterLoginDomain()}`;
}

/** The address the same CounterID mapped to before the domain moved. */
export function legacyCounterEmailForCode(staffCode: string): string {
  return `${normalize(staffCode)}@${legacyCounterLoginDomain}`;
}

/**
 * A typed admin identifier as an address.
 *
 * An input containing `@` is taken at face value: admins may sign in with an
 * ordinary mailbox listed in `admin_users`, and rewriting that would be wrong.
 */
export function adminEmailForUsername(username: string): string {
  const clean = normalize(username);
  if (!clean) return "";
  return clean.includes("@") ? clean : `${clean}@${adminLoginDomain()}`;
}

export function legacyAdminEmailForUsername(username: string): string {
  const clean = normalize(username);
  if (!clean) return "";
  return clean.includes("@") ? clean : `${clean}@${legacyAdminLoginDomain}`;
}

/**
 * Every address a CounterID could currently sign in with, in priority order.
 *
 * More than one entry only during the domain transition; a staff member
 * provisioned or rotated since then matches on the first try.
 */
export function counterSignInAddresses(staffCode: string): string[] {
  const code = normalize(staffCode);
  if (!code) return [];
  return counterLoginDomains().map((domain) => `${code}@${domain}`);
}

export function adminSignInAddresses(username: string): string[] {
  const clean = normalize(username);
  if (!clean) return [];
  // A real mailbox has exactly one spelling; only derived usernames fan out.
  if (clean.includes("@")) return [clean];
  return adminLoginDomains().map((domain) => `${clean}@${domain}`);
}

/**
 * Whether an address belongs to a staff portal.
 *
 * Suffix match on the whole address, never `includes` —
 * `x@admin.baebe-boo.local.evil.com` must not be treated as staff, and more
 * importantly must not be treated as safe.
 */
export function isStaffLoginEmail(value: string): boolean {
  const email = normalize(value);
  return staffLoginDomains().some((domain) => email.endsWith(`@${domain}`));
}

export function isCounterLoginEmail(value: string): boolean {
  const email = normalize(value);
  return counterLoginDomains().some((domain) => email.endsWith(`@${domain}`));
}

export function isAdminLoginEmail(value: string): boolean {
  const email = normalize(value);
  return adminLoginDomains().some((domain) => email.endsWith(`@${domain}`));
}

/** Whether `value` is *this* CounterID's address, on either domain. */
export function isCounterLoginEmailForCode(value: string, staffCode: string): boolean {
  const code = normalize(staffCode);
  if (!code) return false;
  const email = normalize(value);
  return counterLoginDomains().some((domain) => email === `${code}@${domain}`);
}

/**
 * Which address to write into `staff_authorizations` for an existing cashier.
 *
 * `is_authorized_counter()` compares the JWT email against exactly this row, so
 * the authorization address and the Auth user's address must move together or
 * not at all. Mid-transition the Auth user is still on the legacy domain, and
 * rewriting only the authorization row would let a cashier sign in and then be
 * refused by the counter guard — the precise failure that made this module
 * necessary. So an address that is already a valid one for this CounterID is
 * kept; anything else (including nothing at all) is derived fresh.
 */
export function resolveCounterAuthorizationEmail(
  existingEmail: string | null | undefined,
  staffCode: string,
): string {
  const existing = normalize(existingEmail);
  return isCounterLoginEmailForCode(existing, staffCode)
    ? existing
    : counterEmailForCode(staffCode);
}
