import "server-only";

import { randomInt } from "node:crypto";
import { isSupabaseAdminConfigured, supabaseAdmin } from "@/lib/supabase-admin";
import { counterEmailForCode } from "@/lib/auth/login-domains";

/**
 * Counter sign-in credentials.
 *
 * Kept out of `stores.ts` deliberately: the GoTrue Admin API is a second
 * system with its own failure modes and its own secret. The login-address
 * convention itself now lives in `src/lib/auth/login-domains.ts`, which the
 * counter login page derives from too, so the two cannot drift.
 */

/**
 * Re-exported so existing server callers keep one import for "provision a
 * counter login and know its address".
 */
export { counterEmailForCode };

export class CounterCredentialError extends Error {
  constructor(
    message: string,
    readonly status = 500,
  ) {
    super(message);
    this.name = "CounterCredentialError";
  }
}

// No 0/O, 1/l/I: a cashier reads this off a slip and types it on a tablet.
const PASSWORD_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const PASSWORD_LENGTH = 14;

/**
 * 14 characters from a 32-symbol alphabet — 70 bits of entropy.
 *
 * `randomInt` rather than `randomBytes[i] % length`: the modulo form is biased
 * whenever the alphabet does not divide 256 evenly.
 */
export function generateCounterPassword() {
  let password = "";
  for (let index = 0; index < PASSWORD_LENGTH; index += 1) {
    password += PASSWORD_ALPHABET[randomInt(PASSWORD_ALPHABET.length)];
  }
  return password;
}

function requireConfigured() {
  if (!isSupabaseAdminConfigured) {
    throw new CounterCredentialError(
      "Counter logins cannot be managed until Supabase is configured.",
      503,
    );
  }
}

/**
 * Counter users get `counter_staff_id` and nothing else.
 *
 * They must NEVER get a `staff_role` key. `private.has_staff_role()` reads
 * `app_metadata.staff_role` and treats `'owner'` as a full administrator —
 * the exact value `scripts/create-admin-user.mjs` sets — so writing one here
 * would hand a cashier owner-level RLS across finance, procurement, vouchers
 * and loyalty. `counter-credentials.test.ts` asserts the payload stays clean.
 */
function counterAppMetadata(staffId: string) {
  return { counter_staff_id: staffId };
}

/**
 * supabase-js can throw as well as return `{ error }`. Normalize both.
 *
 * The generic is over the whole result rather than over `data`, because a
 * GoTrue response is a union (`{ user: User, error: null }` |
 * `{ user: null, error: AuthError }`) that TypeScript will not distribute
 * across a `{ data: T }` parameter. `Result["data"]` collapses the union to
 * the nullable shape the callers already check for.
 */
async function callAuthAdmin<
  Result extends { data: unknown; error: { message: string } | null },
>(
  operation: () => Promise<Result>,
  failureMessage: string,
): Promise<Result["data"]> {
  try {
    const { data, error } = await operation();
    if (error) throw new CounterCredentialError(`${failureMessage} (${error.message})`, 502);
    return data;
  } catch (error) {
    if (error instanceof CounterCredentialError) throw error;
    throw new CounterCredentialError(failureMessage, 502);
  }
}

export type ProvisionedCounterUser = {
  authUserId: string;
  email: string;
  password: string;
};

/**
 * Find an existing counter login by address.
 *
 * Only used to repair a staff row whose `auth_user_id` was lost — normally
 * mid-provision. supabase-js v2 has no `getUserByEmail`, so this pages
 * `listUsers`, which walks every user in the project including customers.
 * That cost is why `shop_staff.auth_user_id` exists; do not call this on a
 * happy path.
 */
async function findCounterUserByEmail(email: string) {
  const needle = email.toLowerCase();
  const perPage = 200;
  const maxPages = 50;

  for (let page = 1; page <= maxPages; page += 1) {
    const data = await callAuthAdmin(
      () => supabaseAdmin.auth.admin.listUsers({ page, perPage }),
      "Existing counter logins could not be listed.",
    );
    const users = data?.users || [];
    const match = users.find((user) => user.email?.toLowerCase() === needle);
    if (match) return match;
    if (users.length < perPage) return null;
  }
  return null;
}

/**
 * Create (or adopt) the Supabase Auth user a CounterID signs in with.
 *
 * The password is returned to the caller once and never stored anywhere.
 */
export async function provisionCounterUser(input: {
  staffId: string;
  staffCode: string;
}): Promise<ProvisionedCounterUser> {
  requireConfigured();

  const email = counterEmailForCode(input.staffCode);
  const password = generateCounterPassword();

  try {
    const data = await callAuthAdmin(
      () =>
        supabaseAdmin.auth.admin.createUser({
          email,
          password,
          // No mailbox exists on the counter subdomain, so there is no
          // confirmation link anyone could ever click.
          email_confirm: true,
          app_metadata: counterAppMetadata(input.staffId),
        }),
      "The counter login could not be created.",
    );

    if (!data?.user?.id) {
      throw new CounterCredentialError("The counter login could not be created.", 502);
    }
    return { authUserId: data.user.id, email, password };
  } catch (error) {
    // A leftover login from an interrupted provision squats the address.
    // Adopting it is the repair, and resets the password in the same step.
    const existing = await findCounterUserByEmail(email);
    if (!existing?.id) throw error;

    await callAuthAdmin(
      () =>
        supabaseAdmin.auth.admin.updateUserById(existing.id, {
          password,
          app_metadata: counterAppMetadata(input.staffId),
        }),
      "The existing counter login could not be reset.",
    );
    return { authUserId: existing.id, email, password };
  }
}

/**
 * Rotate the CounterID.
 *
 * Updates the *existing* auth user rather than creating a new one, so
 * `shop_staff.auth_user_id` and every `audit_logs.actor_user_id` written under
 * the old code stay pointing at the same person. The password is rotated at
 * the same time because the old one was issued against the old CounterID.
 */
export async function rotateCounterUserCode(input: {
  authUserId: string;
  staffId: string;
  staffCode: string;
}): Promise<{ email: string; password: string }> {
  requireConfigured();

  const email = counterEmailForCode(input.staffCode);
  const password = generateCounterPassword();

  await callAuthAdmin(
    () =>
      supabaseAdmin.auth.admin.updateUserById(input.authUserId, {
        email,
        password,
        email_confirm: true,
        app_metadata: counterAppMetadata(input.staffId),
      }),
    "The counter login could not be renamed.",
  );

  return { email, password };
}

export async function resetCounterUserPassword(
  authUserId: string,
): Promise<{ password: string }> {
  requireConfigured();

  const password = generateCounterPassword();
  await callAuthAdmin(
    () => supabaseAdmin.auth.admin.updateUserById(authUserId, { password }),
    "The counter password could not be reset.",
  );
  return { password };
}

export async function deleteCounterUser(authUserId: string) {
  requireConfigured();
  await callAuthAdmin(
    () => supabaseAdmin.auth.admin.deleteUser(authUserId),
    "The counter login could not be removed.",
  );
}
