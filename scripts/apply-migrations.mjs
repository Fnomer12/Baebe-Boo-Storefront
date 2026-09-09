#!/usr/bin/env node
/**
 * Apply the pending migrations to the Supabase project.
 *
 * WHY THIS EXISTS
 * ---------------
 * The service-role key in `.env.production` authenticates against PostgREST,
 * which executes only the functions the schema declares — it cannot run DDL.
 * There is no `exec_sql` RPC on this project (checked), no database password
 * on this host, and `db.<ref>.supabase.co:5432` is not reachable from here.
 *
 * So applying a migration needs a credential that is deliberately NOT stored
 * with the app: a Supabase **personal access token**, which the Management API
 * accepts and which can run arbitrary SQL against the project.
 *
 *   Create one at https://supabase.com/dashboard/account/tokens
 *
 * Usage:
 *   SUPABASE_ACCESS_TOKEN=sbp_... node scripts/apply-migrations.mjs --dry-run
 *   SUPABASE_ACCESS_TOKEN=sbp_... node scripts/apply-migrations.mjs --apply
 *
 * `--dry-run` (the default) contacts the API only to confirm the token works
 * and to read the current schema state. It sends no DDL.
 *
 * A token is a full-access credential for your Supabase account. Revoke it
 * from that same page when this is done.
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** In dependency order. Each file is individually idempotent. */
const MIGRATIONS = [
  ["20260807_restore_row_security.sql", "Restore RLS on orders, shop_staff, members"],
  ["20260807_counter_sale_order_item_columns.sql", "Let the till record a sale"],
  ["20260806_z_variable_products.sql", "products.options + backfill"],
  ["20260807_staff_login_domain.sql", "Data-driven staff sign-in domains"],
  ["20260807_customer_merge_and_schedule.sql", "members.user_id + campaign schedule"],
  ["20260808_featured_products_and_shipping_columns.sql", "products.is_featured + orders shipping columns"],
  ["20260904_category_promotions_loyalty.sql", "promotion_categories + channel flags + loyalty tiers/policy"],
  ["20260905_site_settings.sql", "site_settings + store_ready flag"],
];

const VERIFY = `
select 'RLS on orders' as check,
       case when relrowsecurity then 'OK' else 'FAILED' end as result
  from pg_class where oid = 'public.orders'::regclass
union all
select 'RLS on shop_staff',
       case when relrowsecurity then 'OK' else 'FAILED' end
  from pg_class where oid = 'public.shop_staff'::regclass
union all
select 'RLS on members',
       case when relrowsecurity then 'OK' else 'FAILED' end
  from pg_class where oid = 'public.members'::regclass
union all
select 'counter sale sets unit_price',
       case when position('unit_price' in pg_get_functiondef(p.oid)) > 0
            then 'OK' else 'FAILED' end
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'complete_counter_sale'
union all
select 'products.options exists',
       case when count(*) = 1 then 'OK' else 'FAILED' end
  from information_schema.columns
 where table_schema='public' and table_name='products' and column_name='options'
union all
select 'members.user_id exists',
       case when count(*) = 1 then 'OK' else 'FAILED' end
  from information_schema.columns
 where table_schema='public' and table_name='members' and column_name='user_id'
union all
select 'products.is_featured exists',
       case when count(*) = 1 then 'OK' else 'FAILED' end
  from information_schema.columns
 where table_schema='public' and table_name='products' and column_name='is_featured'
union all
 select 'orders shipping columns exist',
        case when count(*) = 3 then 'OK' else 'FAILED' end
   from information_schema.columns
  where table_schema='public' and table_name='orders'
    and column_name in ('shipping_status','shipped_at','delivered_at')
union all
select 'promotion_categories exists',
       case when count(*) = 1 then 'OK' else 'FAILED' end
  from information_schema.tables
 where table_schema='public' and table_name='promotion_categories'
union all
select 'promotions channel columns exist',
       case when count(*) = 2 then 'OK' else 'FAILED' end
  from information_schema.columns
 where table_schema='public' and table_name='promotions'
   and column_name in ('available_online','available_at_counter')
union all
select 'loyalty engine tables exist',
       case when count(*) = 2 then 'OK' else 'FAILED' end
  from information_schema.tables
 where table_schema='public' and table_name in ('loyalty_tiers','loyalty_redemption_policy')
union all
select 'purchase earn reads loyalty_rules',
       case when position('loyalty_rules' in pg_get_functiondef(p.oid)) > 0
            then 'OK' else 'FAILED' end
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'finalize_checkout_reservation'
union all
select 'site_settings store_ready seeded',
       case when count(*) = 1 then 'OK' else 'FAILED' end
  from public.site_settings
 where key = 'store_ready';
`;

function projectRef() {
  for (const file of [".env.development.local", ".env.production"]) {
    const path = resolve(root, file);
    if (!existsSync(path)) continue;
    const match = readFileSync(path, "utf8").match(
      /NEXT_PUBLIC_SUPABASE_URL=\s*https:\/\/([a-z0-9]+)\.supabase\.co/i,
    );
    if (match) return match[1];
  }
  throw new Error("Could not read the project ref from NEXT_PUBLIC_SUPABASE_URL.");
}

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const APPLY = process.argv.includes("--apply");
const REF = projectRef();

if (!TOKEN) {
  console.error(
    "Missing SUPABASE_ACCESS_TOKEN.\n" +
      "Create one at https://supabase.com/dashboard/account/tokens, then:\n" +
      "  SUPABASE_ACCESS_TOKEN=sbp_... node scripts/apply-migrations.mjs --apply",
  );
  process.exit(1);
}

async function runSql(query) {
  const response = await fetch(
    `https://api.supabase.com/v1/projects/${REF}/database/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query }),
    },
  );
  const text = await response.text();
  if (!response.ok) throw new Error(`${response.status} ${text.slice(0, 600)}`);
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function main() {
  console.log(`Project ${REF} · ${APPLY ? "APPLY" : "dry run (no DDL sent)"}\n`);

  // Prove the token works before doing anything that changes the database.
  await runSql("select 1");
  console.log("Token accepted.\n");

  if (!APPLY) {
    console.log("Current state:");
    console.table(await runSql(VERIFY));
    console.log("\nRe-run with --apply to send the migrations.");
    return;
  }

  for (const [file, description] of MIGRATIONS) {
    const path = resolve(root, "supabase/migrations", file);
    process.stdout.write(`  ${file}\n    ${description} … `);
    try {
      await runSql(readFileSync(path, "utf8"));
      console.log("done");
    } catch (error) {
      console.log("FAILED");
      console.error(`\n${error.message}\n`);
      console.error(
        "Stopped here. Everything before this point applied; nothing after was sent.\n" +
          "Each file is idempotent, so fix the cause and re-run — the earlier ones are no-ops.",
      );
      process.exit(1);
    }
  }

  console.log("\nVerification:");
  console.table(await runSql(VERIFY));
}

main().catch((error) => {
  console.error(`\n${error.message}`);
  process.exit(1);
});
