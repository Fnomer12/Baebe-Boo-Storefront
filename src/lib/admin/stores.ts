import "server-only";

import { randomBytes } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { recordAudit, type AdminActor } from "@/lib/admin/audit";
import {
  CounterCredentialError,
  counterEmailForCode,
  deleteCounterUser,
  provisionCounterUser,
  resetCounterUserPassword,
  rotateCounterUserCode,
} from "@/lib/admin/counter-credentials";
import { resolveCounterAuthorizationEmail } from "@/lib/auth/login-domains";
import type {
  StaffCreateInput,
  StaffPatchInput,
  StoreCreateInput,
  StorePatchInput,
} from "@/lib/admin/store-schemas";

export class AdminStoreError extends Error {
  constructor(
    message: string,
    readonly status = 500,
  ) {
    super(message);
  }
}

type StoreRow = {
  id: string;
  name: string | null;
  location: string | null;
  database_name: string | null;
  whatsapp_number: string | null;
  is_active: boolean | null;
  created_at: string | null;
};

type StaffRow = {
  id: string;
  shop_id: string;
  staff_name: string | null;
  staff_contact: string | null;
  profile_image_url: string | null;
  staff_code: string | null;
  created_at: string | null;
  auth_user_id?: string | null;
};

type StaffAuthorizationRow = {
  email: string;
  staff_id: string;
  active: boolean | null;
};

export type AdminStoreStaff = {
  id: string;
  shopId: string;
  staffName: string;
  staffContact: string;
  profileImageUrl: string;
  staffCode: string;
  authorizedEmail: string;
  accessActive: boolean;
  accessConfigured: boolean;
  /**
   * Whether this staff member has a Supabase Auth user to sign in with.
   * `null` means unknown, because the deployment predates
   * `shop_staff.auth_user_id` — a missing column is not the same as a
   * missing login, and the UI must not claim it is.
   */
  signInReady: boolean | null;
  createdAt: string;
};

export type AdminStore = {
  id: string;
  name: string;
  location: string;
  databaseName: string;
  whatsappNumber: string;
  isActive: boolean;
  createdAt: string;
  staff: AdminStoreStaff[];
};

function databaseFailure(message: string): never {
  throw new AdminStoreError(message, 500);
}

function notFound(message: string): never {
  throw new AdminStoreError(message, 404);
}

function conflict(message: string): never {
  throw new AdminStoreError(message, 409);
}

/**
 * Is this "the table is not exposed on this deployment", as opposed to a real
 * failure against a table that exists?
 *
 * The message check is anchored to the two phrasings Postgres and PostgREST
 * use for a missing relation. It used to accept ANY message merely containing
 * the word `staff_authorizations`, which meant a permission error, a
 * constraint violation or a serialization failure on that table all read as
 * "table absent" and were silently swallowed — reporting success for a write
 * that never happened.
 */
function isUnavailableTableError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const row = error as { code?: string; message?: string };
  // PGRST205: not found in PostgREST's schema cache. 42P01: undefined_table.
  if (row.code === "PGRST205" || row.code === "42P01") return true;
  const message = row.message?.toLowerCase() ?? "";
  return (
    message.includes("staff_authorizations") &&
    (message.includes("does not exist") || message.includes("could not find"))
  );
}

/**
 * `shop_staff.auth_user_id` arrives with 20260728_shop_staff_auth_user.sql.
 * Deployments that have not run it yet must still be able to load the Stores
 * workspace, so the column is probed and the query retried without it.
 */
function isMissingColumnError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const row = error as { code?: string; message?: string };
  return (
    row.code === "42703" ||
    row.code === "PGRST204" ||
    row.message?.toLowerCase().includes("auth_user_id") === true
  );
}

/**
 * `shops.database_name` is `not null` and read by nothing, so it is derived
 * from the branch name rather than asked for. It used to be a form field whose
 * blank value was posted straight into a `min(1)` schema, which 400'd every
 * single store creation.
 */
function normalizeDatabaseName(name: string) {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
  return slug || `store_${Date.now()}`;
}

function mapStores(
  stores: StoreRow[],
  staffRows: StaffRow[],
  authorizationRows: StaffAuthorizationRow[],
  authorizationAvailable: boolean,
  authUserAvailable: boolean,
): AdminStore[] {
  const authorizationsByStaffId = new Map<string, StaffAuthorizationRow>();
  for (const authorization of authorizationRows) {
    authorizationsByStaffId.set(authorization.staff_id, authorization);
  }

  const staffByStoreId = new Map<string, AdminStoreStaff[]>();
  for (const staff of staffRows) {
    const authorization = authorizationsByStaffId.get(staff.id);
    const nextStaff: AdminStoreStaff = {
      id: staff.id,
      shopId: staff.shop_id,
      staffName: staff.staff_name || "Unnamed staff",
      staffContact: staff.staff_contact || "",
      profileImageUrl: staff.profile_image_url || "",
      staffCode: staff.staff_code || "",
      authorizedEmail: authorization?.email || "",
      accessActive: Boolean(authorization?.active),
      accessConfigured: authorizationAvailable,
      signInReady: authUserAvailable ? Boolean(staff.auth_user_id) : null,
      createdAt: staff.created_at || "",
    };
    staffByStoreId.set(staff.shop_id, [
      ...(staffByStoreId.get(staff.shop_id) || []),
      nextStaff,
    ]);
  }

  return stores.map((store) => ({
    id: store.id,
    name: store.name || "Unnamed store",
    location: store.location || "",
    databaseName: store.database_name || "",
    whatsappNumber: store.whatsapp_number || "",
    isActive: store.is_active !== false,
    createdAt: store.created_at || "",
    staff: (staffByStoreId.get(store.id) || []).sort((first, second) =>
      first.staffName.localeCompare(second.staffName),
    ),
  }));
}

const STAFF_COLUMNS =
  "id, shop_id, staff_name, staff_contact, profile_image_url, staff_code, created_at";

async function loadStaffRows() {
  const withAuthUser = await supabaseAdmin
    .from("shop_staff")
    .select(`${STAFF_COLUMNS}, auth_user_id`)
    .order("created_at", { ascending: true });

  if (!withAuthUser.error) {
    return { rows: withAuthUser.data, error: null, authUserAvailable: true };
  }
  if (!isMissingColumnError(withAuthUser.error)) {
    return { rows: null, error: withAuthUser.error, authUserAvailable: false };
  }

  const withoutAuthUser = await supabaseAdmin
    .from("shop_staff")
    .select(STAFF_COLUMNS)
    .order("created_at", { ascending: true });
  return {
    rows: withoutAuthUser.data,
    error: withoutAuthUser.error,
    authUserAvailable: false,
  };
}

async function loadStoreRows() {
  const [
    { data: stores, error: storesError },
    staffResult,
    { data: authorizations, error: authorizationError },
  ] = await Promise.all([
    supabaseAdmin
      .from("shops")
      .select("id, name, location, database_name, whatsapp_number, is_active, created_at")
      .order("created_at", { ascending: true }),
    loadStaffRows(),
    supabaseAdmin
      .from("staff_authorizations")
      .select("email, staff_id, active"),
  ]);

  if (storesError) databaseFailure("Stores could not be loaded.");
  if (staffResult.error) databaseFailure("Store staff could not be loaded.");
  if (authorizationError && !isUnavailableTableError(authorizationError)) {
    databaseFailure("Counter access records could not be loaded.");
  }

  return {
    stores: (stores || []) as unknown as StoreRow[],
    staff: (staffResult.rows || []) as unknown as StaffRow[],
    authorizations: authorizationError
      ? []
      : (authorizations || []) as unknown as StaffAuthorizationRow[],
    authorizationAvailable: !authorizationError,
    authUserAvailable: staffResult.authUserAvailable,
  };
}

export async function listStores() {
  const rows = await loadStoreRows();
  return mapStores(
    rows.stores,
    rows.staff,
    rows.authorizations,
    rows.authorizationAvailable,
    rows.authUserAvailable,
  );
}

export async function getStore(storeId: string) {
  const stores = await listStores();
  const store = stores.find((candidate) => candidate.id === storeId);
  if (!store) notFound("Store not found.");
  return store;
}

async function generateStaffCode() {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const code = `BB${randomBytes(3).toString("hex").toUpperCase()}`;
    const { data, error } = await supabaseAdmin
      .from("shop_staff")
      .select("id")
      .eq("staff_code", code)
      .maybeSingle();
    if (error) databaseFailure("Staff code could not be generated.");
    if (!data) return code;
  }
  return `BB${Date.now().toString(36).toUpperCase().slice(-8)}`;
}

/**
 * Record the Auth user backing a staff member.
 *
 * Tolerates the column being absent so a deployment that has not run
 * 20260728_shop_staff_auth_user.sql can still create staff; the login works,
 * it just cannot be found again for a password reset until the migration
 * lands. Reports whether the id was actually stored.
 */
async function setStaffAuthUserId(staffId: string, authUserId: string | null) {
  const { error } = await supabaseAdmin
    .from("shop_staff")
    .update({ auth_user_id: authUserId })
    .eq("id", staffId);
  if (error && isMissingColumnError(error)) return false;
  if (error) conflict("The counter login could not be linked to this staff member.");
  return true;
}

/** Just the identity columns the credential flows need. */
type StaffIdentityRow = {
  id: string;
  shop_id: string;
  staff_code: string | null;
  auth_user_id?: string | null;
};

async function getStaffRow(staffId: string): Promise<StaffIdentityRow | null> {
  const withAuthUser = await supabaseAdmin
    .from("shop_staff")
    .select("id, shop_id, staff_code, auth_user_id")
    .eq("id", staffId)
    .maybeSingle();

  if (!withAuthUser.error) {
    return (withAuthUser.data as unknown as StaffIdentityRow | null) ?? null;
  }
  if (!isMissingColumnError(withAuthUser.error)) {
    databaseFailure("Staff member could not be loaded.");
  }

  const fallback = await supabaseAdmin
    .from("shop_staff")
    .select("id, shop_id, staff_code")
    .eq("id", staffId)
    .maybeSingle();
  if (fallback.error) databaseFailure("Staff member could not be loaded.");
  return (fallback.data as unknown as StaffIdentityRow | null) ?? null;
}

function credentialFailure(error: unknown): never {
  if (error instanceof CounterCredentialError) {
    throw new AdminStoreError(error.message, error.status);
  }
  throw new AdminStoreError("The counter login could not be updated.", 502);
}

/** What `staff_authorizations` currently says about a staff member. */
type CurrentAuthorization = {
  email: string | null;
  active: boolean;
};

/**
 * The authorization row this staff member currently has, if any.
 *
 * Read before any credential action, because `syncStaffAuthorization` deletes
 * the row and writes a fresh one — whatever is not carried across is lost.
 *
 * Tolerates the table being absent for the same reason every other read of it
 * does: a deployment that has not exposed `staff_authorizations` must still be
 * able to open the Stores workspace.
 */
async function currentAuthorization(staffId: string): Promise<CurrentAuthorization | null> {
  const { data, error } = await supabaseAdmin
    .from("staff_authorizations")
    .select("email, active")
    .eq("staff_id", staffId)
    .maybeSingle();

  // A real query failure is NOT the same as "this staff member has no
  // authorization row", even though both used to return null here. Since a
  // missing row deliberately means "never configured, so start switched on",
  // collapsing the two let a transient database blip re-grant counter access
  // to a cashier an admin had just revoked. Refuse the whole credential
  // action instead of guessing — the admin can retry, and retrying is
  // cheaper than an ex-employee holding a working till login.
  //
  // The one tolerated error is the table not being exposed at all, which is
  // the deployment case every other read of it already allows for.
  if (error && !isUnavailableTableError(error)) {
    databaseFailure("Counter access records could not be read, so nothing was changed.");
  }
  if (!data) return null;
  return {
    email: typeof data.email === "string" ? data.email : null,
    // Mirrors `mapStores`: anything other than a literal `true` shows as
    // revoked in the workspace, so it has to count as revoked here too.
    active: data.active === true,
  };
}

/**
 * Whether a credential action should leave counter access switched on.
 *
 * Never assume `true`. `resetStaffCredentials` and `regenerateStaffCode` used
 * to assert it, so an admin who had deliberately revoked a cashier and later
 * clicked "Reset password" or "Issue a new CounterID" on that same card
 * silently handed access back to someone they had removed — and nothing on
 * screen said so. Access is only ever granted or removed by an admin saying so.
 *
 * No row at all is a staff member who was never configured; that is exactly
 * what the "Create login" repair is for, so it starts switched on.
 */
function accessActiveToKeep(authorization: CurrentAuthorization | null) {
  return authorization ? authorization.active : true;
}

/**
 * The address to authorize a staff member under, without moving them.
 *
 * `is_authorized_counter()` compares the JWT email against
 * `staff_authorizations.email`, and a password reset does not rename the Auth
 * user — so rewriting the authorization row to today's domain while the Auth
 * user is still on the retired `.local` one would let a cashier sign in and
 * then be refused by the counter guard. Keep whatever already works; derive
 * only when there is nothing to keep.
 */
async function authorizationEmailForStaff(staffId: string, staffCode: string) {
  const authorization = await currentAuthorization(staffId);
  return resolveCounterAuthorizationEmail(authorization?.email ?? null, staffCode);
}

async function syncStaffAuthorization(
  staffId: string,
  email: string | undefined,
  active: boolean,
) {
  const { error: deleteError } = await supabaseAdmin
    .from("staff_authorizations")
    .delete()
    .eq("staff_id", staffId);
  if (deleteError && isUnavailableTableError(deleteError)) return;
  if (deleteError) conflict("Counter access could not be updated.");

  if (!email) return;

  const { error: upsertError } = await supabaseAdmin
    .from("staff_authorizations")
    .upsert({
      email,
      staff_id: staffId,
      active,
    }, { onConflict: "email" });
  if (upsertError && isUnavailableTableError(upsertError)) return;
  if (upsertError) conflict("Counter access could not be updated.");
}

export async function createStore(input: StoreCreateInput) {
  const { data, error } = await supabaseAdmin
    .from("shops")
    .insert({
      name: input.name,
      location: input.location,
      database_name: normalizeDatabaseName(input.name),
      whatsapp_number: input.whatsappNumber || null,
      is_active: input.isActive,
    })
    .select("id")
    .single();

  if (error || !data?.id) conflict("Store could not be created.");
  return getStore(data.id as string);
}

export async function patchStore(storeId: string, input: StorePatchInput) {
  const update: Record<string, string | boolean | null> = {};
  if (input.name !== undefined) update.name = input.name;
  if (input.location !== undefined) update.location = input.location;
  // Deliberately absent: `database_name`. It is derived once at creation and
  // never rewritten — renaming a branch must not churn a column other rows
  // (`authorization.ts`'s counter session payload) already carry.
  if (input.whatsappNumber !== undefined) update.whatsapp_number = input.whatsappNumber;
  if (input.isActive !== undefined) update.is_active = input.isActive;

  const { data, error } = await supabaseAdmin
    .from("shops")
    .update(update)
    .eq("id", storeId)
    .select("id")
    .maybeSingle();

  if (error) conflict("Store could not be updated.");
  if (!data?.id) notFound("Store not found.");
  return getStore(data.id as string);
}

export async function deactivateStore(storeId: string) {
  return patchStore(storeId, { isActive: false });
}

export type StaffCredentials = {
  staffCode: string;
  email: string;
  password: string;
};

/**
 * Create a staff member and the counter login they sign in with.
 *
 * Ordering is Postgres first, Auth second, compensating backwards. A crash
 * after the staff row exists leaves a visible "login missing" row an admin can
 * repair in one click; doing it the other way round would leave an invisible
 * Auth orphan squatting the login address so every retry collides.
 *
 * The password is returned exactly once and is never persisted or audited.
 */
export async function createStaff(
  storeId: string,
  input: StaffCreateInput,
  actor: AdminActor,
): Promise<{ store: AdminStore; credentials: StaffCredentials }> {
  const { data: store } = await supabaseAdmin
    .from("shops")
    .select("id")
    .eq("id", storeId)
    .maybeSingle();
  if (!store) notFound("Store not found.");

  const staffCode = await generateStaffCode();
  const { data, error } = await supabaseAdmin
    .from("shop_staff")
    .insert({
      shop_id: storeId,
      staff_name: input.staffName,
      staff_contact: input.staffContact,
      profile_image_url: input.profileImageUrl || null,
      staff_code: staffCode,
    })
    .select("id")
    .single();

  if (error || !data?.id) conflict("Staff member could not be created.");
  const staffId = data.id as string;

  // Derived, never typed by an admin. The counter login page derives the same
  // address from the CounterID through `login-domains.ts`, and
  // is_authorized_counter() compares the two — an admin-typed address silently
  // locks the cashier out, which is why the field is gone from the form.
  const email = counterEmailForCode(staffCode);
  await syncStaffAuthorization(staffId, email, input.accessActive);

  let provisioned: StaffCredentials;
  try {
    const user = await provisionCounterUser({ staffId, staffCode });
    await setStaffAuthUserId(staffId, user.authUserId);
    provisioned = { staffCode, email: user.email, password: user.password };
  } catch (credentialError) {
    await rollbackStaff(staffId, actor);
    return credentialFailure(credentialError);
  }

  await recordAudit(actor, "staff.create", "shop_staff", staffId, null, {
    shopId: storeId,
    staffName: input.staffName,
    staffCode,
  });

  return { store: await getStore(storeId), credentials: provisioned };
}

/**
 * Undo a half-finished provision. If the compensation itself fails, the mess
 * is recorded so it is discoverable rather than silent.
 */
async function rollbackStaff(staffId: string, actor: AdminActor) {
  const { error: authorizationError } = await supabaseAdmin
    .from("staff_authorizations")
    .delete()
    .eq("staff_id", staffId);
  const { error: staffError } = await supabaseAdmin
    .from("shop_staff")
    .delete()
    .eq("id", staffId);

  if (authorizationError || staffError) {
    await recordAudit(actor, "staff.provision_orphan", "shop_staff", staffId, null, {
      reason: "Counter login failed and the staff row could not be rolled back.",
    });
  }
}

/**
 * Undo a CounterID rename that GoTrue refused.
 *
 * Unlike `rollbackStaff` there is nothing to delete: the staff member existed
 * before this call and must still exist after it, with the credentials they
 * walked in with. Both halves go back — the code on `shop_staff` and the
 * address plus access state on `staff_authorizations` — because a cashier
 * holding the old CounterID can only sign in if both still name it.
 *
 * A previous authorization of `null` means there was no row, so the
 * compensation is to leave none.
 */
async function rollbackStaffCode(
  staffId: string,
  previousStaffCode: string | null,
  previousAuthorization: CurrentAuthorization | null,
  actor: AdminActor,
) {
  const { error: staffError } = await supabaseAdmin
    .from("shop_staff")
    .update({ staff_code: previousStaffCode })
    .eq("id", staffId);

  let authorizationRestored = true;
  try {
    await syncStaffAuthorization(
      staffId,
      previousAuthorization?.email ?? undefined,
      previousAuthorization?.active ?? false,
    );
  } catch {
    // `syncStaffAuthorization` throws an AdminStoreError. Swallow it here: the
    // caller is about to report the credential failure that actually matters,
    // and the audit line below makes the leftover discoverable.
    authorizationRestored = false;
  }

  if (staffError || !authorizationRestored) {
    await recordAudit(actor, "staff.rotate_code_orphan", "shop_staff", staffId, null, {
      reason: "The counter login could not be renamed and the CounterID could not be put back.",
      staffCode: previousStaffCode,
    });
  }
}

export async function patchStaff(staffId: string, input: StaffPatchInput) {
  const update: Record<string, string | null> = {};
  if (input.staffName !== undefined) update.staff_name = input.staffName;
  if (input.staffContact !== undefined) update.staff_contact = input.staffContact;
  if (input.profileImageUrl !== undefined) {
    update.profile_image_url = input.profileImageUrl || null;
  }

  let shopId = "";
  if (Object.keys(update).length > 0) {
    const { data, error } = await supabaseAdmin
      .from("shop_staff")
      .update(update)
      .eq("id", staffId)
      .select("id, shop_id")
      .maybeSingle();
    if (error) conflict("Staff member could not be updated.");
    if (!data?.id) notFound("Staff member not found.");
    shopId = String(data.shop_id);
  } else {
    const { data, error } = await supabaseAdmin
      .from("shop_staff")
      .select("id, shop_id")
      .eq("id", staffId)
      .maybeSingle();
    if (error) databaseFailure("Staff member could not be loaded.");
    if (!data?.id) notFound("Staff member not found.");
    shopId = String(data.shop_id);
  }

  if (input.accessActive !== undefined) {
    const staff = await getStaffRow(staffId);
    if (!staff?.staff_code) notFound("Staff member not found.");
    await syncStaffAuthorization(
      staffId,
      await authorizationEmailForStaff(staffId, String(staff.staff_code)),
      input.accessActive,
    );
  }

  return getStore(shopId);
}

/**
 * Revoke a staff member's access without deleting them.
 *
 * `orders.staff_id` is `on delete set null`, so a hard delete would erase
 * exactly the cashier attribution the counter sale migration exists to create
 * — every past sale would lose the person who rang it up.
 *
 * `staff_authorizations.active = false` is the authoritative kill switch:
 * `is_authorized_counter()` requires `active = true` and backs the
 * `staff_counter_read` RLS policy, so it is re-evaluated on every request and
 * takes effect immediately, even on an unexpired JWT.
 */
export async function deleteStaff(staffId: string, actor: AdminActor) {
  const staff = await getStaffRow(staffId);
  if (!staff?.id) notFound("Staff member not found.");

  const { error } = await supabaseAdmin
    .from("staff_authorizations")
    .update({ active: false })
    .eq("staff_id", staffId);
  if (error && !isUnavailableTableError(error)) {
    conflict("Counter access could not be revoked.");
  }

  if (staff.auth_user_id) {
    try {
      await deleteCounterUser(String(staff.auth_user_id));
      await setStaffAuthUserId(staffId, null);
    } catch {
      // The Auth user is a convenience, not the gate. Access is already
      // revoked above; leaving a login that authorizes nothing is safe, and
      // failing the whole request here would leave the admin thinking the
      // revoke did not happen.
    }
  }

  await recordAudit(actor, "staff.revoke", "shop_staff", staffId, null, {
    shopId: staff.shop_id,
  });

  return getStore(String(staff.shop_id));
}

/**
 * Issue a new CounterID.
 *
 * This renames the login, so the existing Auth user is updated rather than
 * replaced — `shop_staff.auth_user_id` and every `audit_logs.actor_user_id`
 * written under the old code stay pointing at the same person. The
 * `staff_authorizations` row must move with it or the cashier is locked out.
 */
export async function regenerateStaffCode(staffId: string, actor: AdminActor) {
  const existing = await getStaffRow(staffId);
  if (!existing?.id) notFound("Staff member not found.");

  // Both read before anything is rewritten. `syncStaffAuthorization` deletes
  // the row it replaces, so this is the only chance to learn what access state
  // to keep — and what to put back if the rename below fails.
  const previousStaffCode = existing.staff_code ?? null;
  const previousAuthorization = await currentAuthorization(staffId);

  const staffCode = await generateStaffCode();
  const { data, error } = await supabaseAdmin
    .from("shop_staff")
    .update({ staff_code: staffCode })
    .eq("id", staffId)
    .select("id, shop_id, staff_code")
    .maybeSingle();

  if (error) conflict("Staff code could not be regenerated.");
  if (!data?.id) notFound("Staff member not found.");

  // Freshly derived, unlike the reset path: `rotateCounterUserCode` renames the
  // Auth user to this same address below, so both halves move together and a
  // cashier still on the retired domain is migrated by rotating their code.
  // The `active` flag is carried over rather than asserted — issuing a new
  // CounterID is not a decision to un-revoke anybody.
  const email = counterEmailForCode(staffCode);
  await syncStaffAuthorization(staffId, email, accessActiveToKeep(previousAuthorization));

  let password = "";
  try {
    if (existing.auth_user_id) {
      const rotated = await rotateCounterUserCode({
        authUserId: String(existing.auth_user_id),
        staffId,
        staffCode,
      });
      password = rotated.password;
    } else {
      // No login yet (or a deployment predating shop_staff.auth_user_id).
      // Rotating the code is a natural moment to create one.
      const user = await provisionCounterUser({ staffId, staffCode });
      await setStaffAuthUserId(staffId, user.authUserId);
      password = user.password;
    }
  } catch (credentialError) {
    // Postgres already points at the new CounterID while GoTrue still holds the
    // old address, so the cashier can now sign in with neither one. Undo the
    // Postgres half the way `createStaff` compensates its own half-finished
    // provision, rather than leaving them locked out of their own till.
    await rollbackStaffCode(staffId, previousStaffCode, previousAuthorization, actor);
    return credentialFailure(credentialError);
  }

  await recordAudit(actor, "staff.rotate_code", "shop_staff", staffId, null, {
    shopId: data.shop_id,
  });

  return {
    store: await getStore(String(data.shop_id)),
    staffCode: String(data.staff_code),
    credentials: { staffCode, email, password } satisfies StaffCredentials,
  };
}

/**
 * Reset the password, creating the login first if this staff member never got
 * one — so a single action also repairs rows created before provisioning
 * existed.
 */
export async function resetStaffCredentials(staffId: string, actor: AdminActor) {
  const staff = await getStaffRow(staffId);
  if (!staff?.id) notFound("Staff member not found.");
  const staffCode = String(staff.staff_code || "");
  if (!staffCode) conflict("This staff member has no CounterID yet.");

  // Read once, before `syncStaffAuthorization` deletes the row: it carries both
  // the address to keep and whether this cashier's access was revoked.
  const authorization = await currentAuthorization(staffId);

  // Resetting a password does not rename the Auth user, so the authorization
  // row must stay on whatever address that user already has — and a revoked
  // cashier stays revoked. Handing out a fresh password is not a decision to
  // let someone back in; only the staff editor's "Counter access" toggle is.
  const email = staff.auth_user_id
    ? resolveCounterAuthorizationEmail(authorization?.email ?? null, staffCode)
    : counterEmailForCode(staffCode);
  await syncStaffAuthorization(staffId, email, accessActiveToKeep(authorization));

  let password = "";
  try {
    if (staff.auth_user_id) {
      password = (await resetCounterUserPassword(String(staff.auth_user_id))).password;
    } else {
      const user = await provisionCounterUser({ staffId, staffCode });
      await setStaffAuthUserId(staffId, user.authUserId);
      password = user.password;
    }
  } catch (credentialError) {
    return credentialFailure(credentialError);
  }

  await recordAudit(actor, "staff.reset_credentials", "shop_staff", staffId, null, {
    shopId: staff.shop_id,
  });

  return {
    store: await getStore(String(staff.shop_id)),
    credentials: { staffCode, email, password } satisfies StaffCredentials,
  };
}
