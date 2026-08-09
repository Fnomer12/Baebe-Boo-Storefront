#!/usr/bin/env node
/**
 * One-time admin bootstrap script.
 *
 * Creates the Supabase Auth user and the matching public.admin_users record
 * needed to sign in to /BaebeAdmin.
 *
 * Run from the project root with the production environment loaded:
 *
 *   node --env-file=.env.production scripts/create-admin-user.mjs
 *
 * Or export the variables manually before running.
 *
 * This script intentionally uses SUPABASE_SECRET_KEY (service_role) so it can
 * create users and write to protected tables. Keep that key secret.
 */

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SECRET_KEY;

const email = process.argv[2];
const password = process.argv[3];
const fullName = process.argv[4] || "Baebe Boo Admin";

function printUsage() {
  console.error(`Usage: node --env-file=.env.production scripts/create-admin-user.mjs <email> <password> [full-name]`);
  console.error(`Example: node --env-file=.env.production scripts/create-admin-user.mjs admin@baebe admin "Baebe Boo Admin"`);
}

if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY.");
  console.error("Make sure the environment file is loaded with --env-file=.env.production");
  process.exit(1);
}

if (!email || !password || password.length < 6) {
  console.error("Please provide a valid email and password (min 6 characters).");
  printUsage();
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

console.log(`Creating admin user: ${email}`);

const { data: existing, error: listError } = await supabase.auth.admin.listUsers({
  page: 1,
  perPage: 1,
});

if (listError) {
  console.error("Could not reach Supabase Auth:", listError.message);
  process.exit(1);
}

const alreadyExists = existing.users.some((u) => u.email?.toLowerCase() === email.toLowerCase());

if (alreadyExists) {
  console.log("A Supabase Auth user with this email already exists.");
  console.log("If the password is wrong, reset it in the Supabase dashboard.");
} else {
  const { data: createData, error: createError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { staff_role: "owner" },
  });

  if (createError) {
    console.error("Failed to create auth user:", createError.message);
    process.exit(1);
  }

  console.log("Created Supabase Auth user:", createData.user.id);
}

const { error: upsertError } = await supabase
  .from("admin_users")
  .upsert(
    { email: email.toLowerCase(), full_name: fullName, role: "boss", is_active: true },
    { onConflict: "email" },
  );

if (upsertError) {
  console.error("Failed to upsert admin_users row:", upsertError.message);
  process.exit(1);
}

console.log("Ensured public.admin_users row for:", email.toLowerCase());
console.log("You can now sign in at /BaebeAdmin/login with the provided credentials.");
