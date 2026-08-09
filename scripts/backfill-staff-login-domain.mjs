#!/usr/bin/env node
/**
 * Move staff logins off the retired `@*.baebe-boo.local` suffix onto the real
 * site host.
 *
 *   node --env-file=.env.production scripts/backfill-staff-login-domain.mjs
 *   node --env-file=.env.production scripts/backfill-staff-login-domain.mjs --apply
 *
 * DRY RUN IS THE DEFAULT. Nothing is written without `--apply`.
 *
 * WHAT MOVES, AND IN WHAT ORDER
 * -----------------------------
 * A staff login is three rows that must agree, because two separate database
 * functions compare a JWT email against a stored one:
 *
 *   auth.users.email            what the person signs in as
 *   staff_authorizations.email  is_authorized_counter() compares this (cashiers)
 *   admin_users.email           is_admin() compares this (admins)
 *
 * Rename any one alone and the person signs in successfully and is then refused
 * by the guard — which looks like a permissions bug, not a rename. So each is
 * moved in the order that leaves NO window where the person is unauthorized:
 *
 *   1. write the NEW authorization row (both addresses are now valid)
 *   2. rename the Auth user
 *   3. delete the OLD authorization row
 *
 * `staff_authorizations.email` is the primary key, so step 1 is an insert
 * rather than an update, and step 3 has to come after the rename or the person
 * is unauthorized in between. `admin_users` gets the same treatment; its `id`
 * is the key, so the intermediate state is simply two rows.
 *
 * Pass `--keep-legacy` to stop after step 2, leaving both addresses authorized.
 * Useful when cashiers are mid-shift: their existing JWTs still carry the old
 * email until the session refreshes. Run again without the flag afterwards to
 * clean up.
 *
 * Uses SUPABASE_SECRET_KEY (service_role) because it writes to auth.users and
 * to RLS-protected tables. Keep that key secret.
 */

import { createClient } from "@supabase/supabase-js";

const LEGACY_SITE_HOST = "baebe-boo.local";
const FALLBACK_SITE_HOST = "baebe-boo.jtechinnovations.tech";
const PORTALS = ["admin", "counter"];

const args = new Set(process.argv.slice(2));
const apply = args.has("--apply");
const keepLegacy = args.has("--keep-legacy");

for (const arg of args) {
  if (!["--apply", "--dry-run", "--keep-legacy"].includes(arg)) {
    console.error(`Unknown option: ${arg}`);
    console.error("Usage: backfill-staff-login-domain.mjs [--apply] [--dry-run] [--keep-legacy]");
    process.exit(1);
  }
}
if (apply && args.has("--dry-run")) {
  console.error("Pass either --apply or --dry-run, not both.");
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SECRET_KEY;
if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY.");
  console.error("Load the environment file with --env-file=.env.production");
  process.exit(1);
}

/** Mirrors `hostFromSiteUrl` in src/lib/auth/login-domains.ts. */
function hostFromSiteUrl(value) {
  const raw = (value ?? "").trim();
  if (!raw) return FALLBACK_SITE_HOST;
  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const host = new URL(candidate).hostname.toLowerCase();
    const bare = host.startsWith("www.") ? host.slice(4) : host;
    return bare || FALLBACK_SITE_HOST;
  } catch {
    return FALLBACK_SITE_HOST;
  }
}

const siteHost = hostFromSiteUrl(process.env.NEXT_PUBLIC_SITE_URL);
if (siteHost === LEGACY_SITE_HOST) {
  console.error(
    `NEXT_PUBLIC_SITE_URL still resolves to ${LEGACY_SITE_HOST}; there is nothing to move.`,
  );
  process.exit(1);
}

/** `till1@counter.baebe-boo.local` -> `{ portal, localPart, next }`, or null. */
function planAddress(email) {
  const normalized = (email ?? "").trim().toLowerCase();
  for (const portal of PORTALS) {
    const suffix = `@${portal}.${LEGACY_SITE_HOST}`;
    if (!normalized.endsWith(suffix)) continue;
    const localPart = normalized.slice(0, -suffix.length);
    if (!localPart) return null;
    return { portal, localPart, before: normalized, after: `${localPart}@${portal}.${siteHost}` };
  }
  return null;
}

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function listAllAuthUsers() {
  const perPage = 200;
  const users = [];
  for (let page = 1; page <= 50; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) {
      console.error("Could not list Supabase Auth users:", error.message);
      process.exit(1);
    }
    users.push(...(data?.users ?? []));
    if ((data?.users ?? []).length < perPage) break;
  }
  return users;
}

function printTable(rows) {
  const columns = ["portal", "who", "before", "after", "action"];
  const widths = columns.map((column) =>
    Math.max(column.length, ...rows.map((row) => String(row[column] ?? "").length)),
  );
  const line = (cells) =>
    cells.map((cell, index) => String(cell ?? "").padEnd(widths[index])).join("  ");

  console.log(line(columns.map((column) => column.toUpperCase())));
  console.log(widths.map((width) => "-".repeat(width)).join("  "));
  for (const row of rows) console.log(line(columns.map((column) => row[column])));
}

const authUsers = await listAllAuthUsers();
const takenEmails = new Map(
  authUsers.filter((user) => user.email).map((user) => [user.email.toLowerCase(), user.id]),
);

const { data: staffRows, error: staffError } = await supabase
  .from("shop_staff")
  .select("id, staff_name, staff_code, auth_user_id");
if (staffError) {
  console.error("Could not read shop_staff:", staffError.message);
  process.exit(1);
}

const { data: authorizationRows, error: authorizationError } = await supabase
  .from("staff_authorizations")
  .select("email, staff_id, active");
if (authorizationError) {
  console.error("Could not read staff_authorizations:", authorizationError.message);
  process.exit(1);
}

const { data: adminRows, error: adminError } = await supabase
  .from("admin_users")
  .select("id, email, full_name, role, is_active");
if (adminError) {
  console.error("Could not read admin_users:", adminError.message);
  process.exit(1);
}

const staffByAuthUserId = new Map(
  (staffRows ?? []).filter((row) => row.auth_user_id).map((row) => [row.auth_user_id, row]),
);
const authorizationByEmail = new Map(
  (authorizationRows ?? []).map((row) => [String(row.email).toLowerCase(), row]),
);

const plan = [];
for (const user of authUsers) {
  const addresses = planAddress(user.email);
  if (!addresses) continue;

  const staff = staffByAuthUserId.get(user.id) ?? null;
  const authorization = authorizationByEmail.get(addresses.before) ?? null;
  const admins = (adminRows ?? []).filter(
    (row) => String(row.email ?? "").toLowerCase() === addresses.before,
  );
  const collision = takenEmails.get(addresses.after);

  plan.push({
    ...addresses,
    authUserId: user.id,
    staff,
    authorization,
    admins,
    who: staff?.staff_name || admins[0]?.full_name || addresses.localPart,
    action:
      collision && collision !== user.id
        ? "SKIP — target address already belongs to another login"
        : addresses.portal === "counter" && !authorization
          ? "rename login (no authorization row to move)"
          : "rename login + move authorization",
    blocked: Boolean(collision && collision !== user.id),
  });
}

// Cashiers with an authorization row but no Auth user at all: nothing to rename,
// but the stale row still has to move or the address they are eventually
// provisioned at will not match it.
for (const [email, authorization] of authorizationByEmail) {
  const addresses = planAddress(email);
  if (!addresses) continue;
  if (plan.some((row) => row.before === email)) continue;
  const staff = (staffRows ?? []).find((row) => row.id === authorization.staff_id) ?? null;
  plan.push({
    ...addresses,
    authUserId: null,
    staff,
    authorization,
    admins: [],
    who: staff?.staff_name || addresses.localPart,
    action: "move authorization only (no Auth user)",
    blocked: false,
  });
}

console.log(`Site host: ${siteHost}`);
console.log(`Legacy host: ${LEGACY_SITE_HOST}`);
console.log(`Mode: ${apply ? "APPLY" : "DRY RUN"}${keepLegacy ? " (keeping legacy rows)" : ""}`);
console.log("");

if (plan.length === 0) {
  console.log("Nothing to move — no login is still on the legacy domain.");
  process.exit(0);
}

printTable(plan);
console.log("");

const blocked = plan.filter((row) => row.blocked);
if (blocked.length > 0) {
  console.log(`${blocked.length} login(s) will be SKIPPED because the target address is taken.`);
  console.log("Resolve those by hand before re-running.\n");
}

// Staff who were never able to sign in at all show up nowhere above, so say so
// explicitly rather than letting an empty line read as "all fine".
const orphanStaff = (staffRows ?? []).filter(
  (row) => !row.auth_user_id && !(authorizationRows ?? []).some((auth) => auth.staff_id === row.id),
);
if (orphanStaff.length > 0) {
  console.log("Staff with no login at all (unaffected by this backfill, but broken today):");
  for (const row of orphanStaff) {
    console.log(`  - ${row.staff_name} (${row.staff_code ?? "no CounterID"})`);
  }
  console.log('  Fix each with "Create login" in the admin Stores workspace.\n');
}

if (!apply) {
  console.log("Dry run complete. Re-run with --apply to write these changes.");
  process.exit(0);
}

let moved = 0;
for (const row of plan) {
  if (row.blocked) continue;

  // 1. New authorization / admin rows first, so both addresses are valid.
  if (row.authorization) {
    const { error } = await supabase.from("staff_authorizations").upsert(
      { email: row.after, staff_id: row.authorization.staff_id, active: row.authorization.active },
      { onConflict: "email" },
    );
    if (error) {
      console.error(`  ${row.who}: could not write the new authorization row — ${error.message}`);
      continue;
    }
  }
  for (const admin of row.admins) {
    const { error } = await supabase.from("admin_users").insert({
      email: row.after,
      full_name: admin.full_name,
      role: admin.role,
      is_active: admin.is_active,
    });
    if (error) {
      console.error(`  ${row.who}: could not write the new admin_users row — ${error.message}`);
      continue;
    }
  }

  // 2. Then the login itself.
  if (row.authUserId) {
    const { error } = await supabase.auth.admin.updateUserById(row.authUserId, {
      email: row.after,
      email_confirm: true,
    });
    if (error) {
      console.error(`  ${row.who}: could not rename the login — ${error.message}`);
      console.error("    The new authorization row was left in place; it is harmless.");
      continue;
    }
  }

  // 3. Only now is the old address safe to remove.
  if (!keepLegacy) {
    if (row.authorization) {
      const { error } = await supabase
        .from("staff_authorizations")
        .delete()
        .eq("email", row.before);
      if (error) console.error(`  ${row.who}: old authorization row left behind — ${error.message}`);
    }
    for (const admin of row.admins) {
      const { error } = await supabase.from("admin_users").delete().eq("id", admin.id);
      if (error) console.error(`  ${row.who}: old admin_users row left behind — ${error.message}`);
    }
  }

  moved += 1;
  console.log(`  moved ${row.before} -> ${row.after}`);
}

console.log("");
console.log(`Moved ${moved} of ${plan.length} login(s).`);
if (keepLegacy) {
  console.log("Legacy rows kept. Re-run without --keep-legacy once every session has refreshed.");
}
