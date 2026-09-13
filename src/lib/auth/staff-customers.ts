import { isStaffLoginEmail } from "@/lib/auth/login-domains";

/**
 * Counter/till staff must never count as customers.
 *
 * Every `auth.users` row gets a `customer_profiles` row from the
 * `bootstrap_customer_account` trigger — including the synthetic
 * `xxx@counter.<host>` logins provisioned for cashiers. Without filtering,
 * each till login shows up in the admin customer list, the top-customers
 * report, campaign audiences, and the till member lookup, and can even earn
 * loyalty points.
 *
 * Staff are identified two ways, and both are needed:
 * - synthetic login email (`isStaffLoginEmail`: current + legacy counter and
 *   admin domains) — catches provisioned accounts even before `shop_staff`
 *   is linked or after it is deactivated;
 * - `shop_staff.auth_user_id` — catches staff rows whose auth email was
 *   changed to something outside the staff domains.
 *
 * Deliberately NOT excluded: admins on ordinary mailboxes (`admin_users`)
 * and any personal account a staff member owns. A cashier who shops with
 * their own email is a genuine customer; only their till login is hidden.
 */

export function isStaffCustomerEmail(email: string | null | undefined): boolean {
  return isStaffLoginEmail(email ?? "");
}

export function excludeStaffProfiles<T extends { user_id: string; email: string | null }>(
  profiles: readonly T[],
  staffUserIds: ReadonlySet<string>,
): T[] {
  return profiles.filter(
    (profile) => !staffUserIds.has(profile.user_id) && !isStaffCustomerEmail(profile.email),
  );
}

export function excludeStaffMembers<T extends { user_id?: string | null | undefined; email: string | null }>(
  members: readonly T[],
  staffUserIds: ReadonlySet<string>,
): T[] {
  return members.filter(
    (member) =>
      !(member.user_id && staffUserIds.has(member.user_id)) &&
      !isStaffCustomerEmail(member.email),
  );
}
