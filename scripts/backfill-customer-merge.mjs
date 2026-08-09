#!/usr/bin/env node
/**
 * Merge public.members into public.customer_profiles.
 *
 * WHAT IT DOES
 * ------------
 *   a) Links every `members` row whose email already has a `customer_profiles`
 *      row, by setting `members.user_id`.
 *   b) For the rest, creates the auth user through the GoTrue admin API. The
 *      `bootstrap_customer_account` trigger on `auth.users` then creates
 *      `customer_profiles` and `reward_accounts` by itself, and NO email is
 *      sent to the customer — `createUser` with `email_confirm: true` does not
 *      send anything, which matters because these people signed up for a
 *      newsletter, not for an account they never asked for.
 *   c) Copies `parent_name`/`phone` onto the profile (blanks only — it must not
 *      overwrite anything the customer has maintained themselves) and the child
 *      fields into `customer_children`.
 *
 * HOW TO RUN IT
 * -------------
 *   node scripts/backfill-customer-merge.mjs             # dry run. Prints a plan, writes nothing.
 *   node scripts/backfill-customer-merge.mjs --apply     # does it.
 *   node scripts/backfill-customer-merge.mjs --apply --limit 10
 *
 * Dry run is the DEFAULT and `--apply` is the only way to write, because this
 * script creates auth users on a production database that has no backup branch
 * and the operation cannot be undone by re-running anything.
 *
 * PREREQUISITE: supabase/migrations/20260807_customer_merge_and_schedule.sql
 * must be applied first — `members.user_id` does not exist without it. The
 * script checks and refuses rather than half-finishing.
 *
 * SAFE TO RUN AGAIN. Linking is idempotent, an existing auth user is reused
 * rather than duplicated, and a child already on file is not added twice.
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const args = new Set(process.argv.slice(2));
const APPLY = args.has("--apply");
const LIMIT = readLimit(process.argv.slice(2));

loadEnv(".env.development.local");
loadEnv(".env.local");
loadEnv(".env.production");

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  fail("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY must be set.");
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

await main();

async function main() {
  banner();

  const members = await loadMembers();
  const profiles = await loadAll("customer_profiles", "user_id, email, full_name, phone, created_at");

  const plan = planCustomerMerge(members, profiles);
  const links = plan.actions.filter((action) => action.kind === "link");
  const creates = plan.actions.filter((action) => action.kind === "create");
  const skips = plan.actions.filter((action) => action.kind === "skip");

  console.log(`members rows           : ${members.length}`);
  console.log(`customer_profiles rows : ${profiles.length}`);
  console.log("");
  console.log(`link to existing account : ${links.length} rows`);
  console.log(`create a new account     : ${creates.length} rows across ${plan.createEmails.length} addresses`);
  console.log(`skip                     : ${skips.length} rows (${skips.filter((s) => s.reason === "already-linked").length} already linked, ${skips.filter((s) => s.reason === "no-email").length} with no email)`);
  console.log("");

  if (plan.createEmails.length > 0) {
    console.log("Addresses that would get a new sign-in account:");
    for (const email of plan.createEmails.slice(0, 20)) console.log(`  ${email}`);
    if (plan.createEmails.length > 20) console.log(`  … and ${plan.createEmails.length - 20} more`);
    console.log("");
  }

  if (!APPLY) {
    console.log("DRY RUN — nothing was written. Re-run with --apply to make these changes.");
    return;
  }

  if (!(await membersHaveUserIdColumn())) {
    fail(
      "members.user_id does not exist. Apply supabase/migrations/20260807_customer_merge_and_schedule.sql first.",
    );
  }

  const memberById = new Map(members.map((member) => [member.id, member]));
  const userIdByEmail = new Map();
  for (const profile of profiles) {
    const email = normalizeEmail(profile.email);
    if (email && !userIdByEmail.has(email)) userIdByEmail.set(email, profile.user_id);
  }

  let created = 0;
  let linked = 0;
  let mergedProfiles = 0;
  let mergedChildren = 0;
  let failed = 0;
  let processed = 0;

  for (const action of [...links, ...creates]) {
    if (LIMIT && processed >= LIMIT) break;
    processed += 1;

    const member = memberById.get(action.memberId);
    if (!member) continue;

    let userId = action.kind === "link" ? action.userId : userIdByEmail.get(action.email);

    if (!userId) {
      userId = await ensureAuthUser(action.email, member.parent_name);
      if (!userId) {
        failed += 1;
        console.error(`  ! could not create an account for ${action.email}`);
        continue;
      }
      userIdByEmail.set(action.email, userId);
      created += 1;
    }

    if (!member.user_id) {
      const { error } = await supabase.from("members").update({ user_id: userId }).eq("id", member.id);
      if (error) {
        failed += 1;
        console.error(`  ! could not link member ${member.id}: ${error.message}`);
        continue;
      }
      linked += 1;
    }

    if (await mergeProfile(userId, action.email, member)) mergedProfiles += 1;
    if (await mergeChild(userId, member)) mergedChildren += 1;
  }

  console.log("");
  console.log(`accounts created   : ${created}`);
  console.log(`members linked     : ${linked}`);
  console.log(`profiles filled in : ${mergedProfiles}`);
  console.log(`children added     : ${mergedChildren}`);
  console.log(`failures           : ${failed}`);
  if (failed > 0) process.exitCode = 1;
}

/**
 * Find or create the auth user for an address.
 *
 * `createUser` is tried first and an "already registered" answer is treated as
 * success, because listing every user to check first is both slower and racy.
 */
async function ensureAuthUser(email, fullName) {
  const created = await supabase.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: fullName ? { full_name: String(fullName).trim() } : undefined,
  });
  if (!created.error && created.data?.user?.id) return created.data.user.id;
  if (created.error && !/already|registered|exists/i.test(created.error.message)) {
    console.error(`  ! ${email}: ${created.error.message}`);
    return null;
  }

  // Already there. The trigger has created the profile, so read the id back.
  const { data } = await supabase
    .from("customer_profiles")
    .select("user_id")
    .eq("email", email)
    .limit(1);
  return data?.[0]?.user_id || null;
}

async function mergeProfile(userId, email, member) {
  const { data } = await supabase
    .from("customer_profiles")
    .select("user_id, full_name, phone")
    .eq("user_id", userId)
    .limit(1);

  const profile = data?.[0];
  if (!profile) {
    // The bootstrap trigger did not fire. Create the row rather than lose the lead.
    const { error } = await supabase.from("customer_profiles").insert({
      user_id: userId,
      email,
      full_name: trimmed(member.parent_name) || null,
      phone: trimmed(member.phone) || null,
    });
    return !error;
  }

  const updates = profileUpdatesFromMember(member, profile);
  if (Object.keys(updates).length === 0) return false;

  const { error } = await supabase
    .from("customer_profiles")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("user_id", userId);
  return !error;
}

async function mergeChild(userId, member) {
  const child = childFromMember(member);
  if (!child) return false;

  const { data } = await supabase
    .from("customer_children")
    .select("first_name, date_of_birth")
    .eq("user_id", userId);

  if (childAlreadyRecorded(data || [], child)) return false;

  const { error } = await supabase.from("customer_children").insert({ user_id: userId, ...child });
  if (error) console.error(`  ! child for ${member.id}: ${error.message}`);
  return !error;
}

async function membersHaveUserIdColumn() {
  const { error } = await supabase.from("members").select("user_id").limit(1);
  return !error;
}

/**
 * `members`, with or without the `user_id` column.
 *
 * A dry run has to work BEFORE the migration is applied — rehearsing the plan
 * is the entire point of the default mode, and selecting a column PostgREST
 * does not know about is a 400 for the whole query, not a null field. Without
 * the fallback the rehearsal died with "Could not read members" on exactly the
 * database it was meant to describe.
 */
async function loadMembers() {
  const base =
    "id, email, parent_name, child_first_name, child_last_name, phone, child_date_of_birth, created_at";
  if (await membersHaveUserIdColumn()) return loadAll("members", `${base}, user_id`);

  console.log("NOTE: members.user_id does not exist yet — the migration has not been applied.");
  console.log("      The plan below is still accurate; --apply will refuse until it is.\n");
  return (await loadAll("members", base)).map((member) => ({ ...member, user_id: null }));
}

/** Past PostgREST's 1000-row ceiling, which would silently truncate the plan. */
async function loadAll(table, columns) {
  const pageSize = 1000;
  const rows = [];
  for (let page = 0; page < 50; page += 1) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .range(page * pageSize, page * pageSize + pageSize - 1);
    if (error) fail(`Could not read ${table}: ${error.message}`);
    rows.push(...(data || []));
    if ((data || []).length < pageSize) break;
  }
  return rows;
}

// ---------------------------------------------------------------------------
// The merge rules, mirrored from src/domain/crm/customer-identity.ts.
//
// This file is a plain .mjs run by node with no bundler, so it cannot import
// the TypeScript module directly. The rules are unit-tested there
// (src/domain/crm/customer-identity.test.ts); keep the two in step, and change
// the tested copy first.
// ---------------------------------------------------------------------------

function normalizeEmail(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function trimmed(value) {
  return (value || "").trim();
}

function planCustomerMerge(members, profiles) {
  const profilesByEmail = new Map();
  for (const profile of profiles) {
    const email = normalizeEmail(profile.email);
    if (!email) continue;
    const bucket = profilesByEmail.get(email);
    if (bucket) bucket.push(profile);
    else profilesByEmail.set(email, [profile]);
  }

  const actions = [];
  const createEmails = [];
  const seenCreate = new Set();

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

function chooseCanonicalProfile(candidates, email) {
  if (candidates.length === 0) return null;
  const wanted = (email || "").trim();
  const exact = wanted ? candidates.filter((row) => (row.email || "").trim() === wanted) : [];
  const pool = exact.length > 0 ? exact : [...candidates];

  return [...pool].sort((first, second) => {
    const firstAt = Date.parse(first.created_at || "") || Number.MAX_SAFE_INTEGER;
    const secondAt = Date.parse(second.created_at || "") || Number.MAX_SAFE_INTEGER;
    if (firstAt !== secondAt) return firstAt - secondAt;
    return String(first.user_id).localeCompare(String(second.user_id));
  })[0];
}

function profileUpdatesFromMember(member, profile) {
  const updates = {};
  const parentName = trimmed(member.parent_name);
  if (parentName && !trimmed(profile.full_name)) updates.full_name = parentName;
  const phone = trimmed(member.phone);
  if (phone && !trimmed(profile.phone)) updates.phone = phone;
  return updates;
}

function childFromMember(member) {
  const firstName = trimmed(member.child_first_name);
  const dateOfBirth = trimmed(member.child_date_of_birth);
  if (!firstName && !dateOfBirth) return null;
  return { first_name: firstName || null, date_of_birth: dateOfBirth || null };
}

function childAlreadyRecorded(existing, candidate) {
  const candidateDob = trimmed(candidate.date_of_birth);
  const candidateName = trimmed(candidate.first_name).toLowerCase();

  return existing.some((child) => {
    const dob = trimmed(child.date_of_birth);
    const name = trimmed(child.first_name).toLowerCase();
    if (candidateDob && dob) return dob === candidateDob;
    return Boolean(candidateName) && name === candidateName;
  });
}

// ---------------------------------------------------------------------------

function readLimit(argv) {
  const index = argv.indexOf("--limit");
  if (index === -1) return 0;
  const value = Number(argv[index + 1]);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

function loadEnv(path) {
  let contents;
  try {
    contents = readFileSync(path, "utf8");
  } catch {
    return;
  }
  for (const line of contents.split("\n")) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (!match) continue;
    if (process.env[match[1]] === undefined) {
      process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
  }
}

function banner() {
  console.log("");
  console.log("Baebe Boo — members → customer_profiles merge");
  console.log(APPLY ? "MODE: APPLY (this writes to production)" : "MODE: dry run");
  if (LIMIT) console.log(`LIMIT: ${LIMIT} rows`);
  console.log("");
}

function fail(message) {
  console.error(`\n${message}\n`);
  process.exit(1);
}
