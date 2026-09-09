-- =====================================================================
-- Baebe Boo — all pending migrations, in dependency order.
--
-- Paste this whole file into the Supabase SQL editor and run it once.
-- It is exactly the five files under supabase/migrations/ concatenated in
-- the order they must run, with nothing added or removed.
--
-- Every section is idempotent, so re-running this file is safe: constraints
-- are dropped-if-exists before being added, inserts use ON CONFLICT, backfills
-- only touch rows that have not already been converted, and the extension and
-- cron blocks trap their own errors and print a notice instead of failing.
--
-- BEFORE YOU RUN, for section 5 only:
--   Dashboard -> Database -> Extensions -> enable `pg_cron` and `pg_net`.
--   If you skip it, section 5 still runs and simply tells you to come back.
--
-- AFTER YOU RUN, for section 5 only: store the two Vault secrets. The exact
-- statements are in the comments at the end of that section.
-- =====================================================================

-- =====================================================================
-- 20260807_restore_row_security.sql
-- Closes a live PII leak: anon can currently read orders, shop_staff and members.
-- =====================================================================
-- Restore row level security on orders, shop_staff and members.
--
-- WHY THIS EXISTS
-- ---------------
-- 20260721_production_security.sql enables RLS on nine tables and writes their
-- policies. On 2026-08-06 a probe with the *publishable* key — the one shipped
-- in every browser bundle — and no user session returned:
--
--   shop_staff  200  Amanda Armstrong / 2026-26BB9DE9FC, Adjei Sampson Kofi, ...
--   orders      200  customer_email of real customers
--   members     200  parent_name, child_first_name, child_date_of_birth
--
-- while order_items, completed_orders and completed_order_items answered
-- `200 []` and admin_users, staff_authorizations and inventory_levels answered
-- `401 42501`. That split is diagnostic: an empty array means RLS is ON and no
-- policy matched; a 401 means the grant itself was revoked; rows mean RLS is
-- OFF. So RLS was switched off on exactly these three tables at some point
-- after the original migration ran, and never switched back on.
--
-- Two things made that worse than a normal misconfiguration:
--
--   1. shop_staff.staff_code IS the counter login id. Publishing that table
--      publishes the username of every cashier in the company.
--   2. src/lib/auth/authorization.ts resolved the signed-in cashier with an
--      unfiltered `.limit(1)` on shop_staff, on the documented assumption that
--      staff_counter_read narrowed it to their own row. With RLS off that
--      assumption silently became "row 1 of the table", so every counter
--      session became whoever sorted first. The application-side filter is
--      being added in the same change, but this file is what makes the
--      original design true again.
--
-- This migration is deliberately narrow: it re-enables RLS on the three
-- affected tables and re-asserts their policies. It does not touch the six
-- tables that are already correct.
--
-- Safe to run more than once.

-- ---------------------------------------------------------------------------
-- 1. Re-enable RLS.
-- ---------------------------------------------------------------------------
alter table public.orders      enable row level security;
alter table public.members     enable row level security;
alter table public.shop_staff  enable row level security;

-- Belt and braces: NO ONE may turn this off implicitly again. `force` also
-- applies RLS to the table owner, which is how a `security definer` function
-- owned by postgres could otherwise read straight past a policy.
-- Deliberately NOT applied — several RPCs (join_family, complete_counter_sale,
-- claim_my_guest_orders) are security definer and depend on owner bypass.
-- Documented here so the next person does not "fix" it.

-- ---------------------------------------------------------------------------
-- 2. Re-assert the policies.
-- ---------------------------------------------------------------------------
-- Verbatim from 20260721_production_security.sql and 20260721_z_commerce_
-- foundation.sql, so this file is a restore rather than a redesign. If RLS was
-- only disabled (not the policies dropped), these are no-ops.

-- orders --------------------------------------------------------------------
-- Admin goes through supabaseAdmin (service_role) and bypasses RLS entirely;
-- this policy covers an admin reading with their own session.
drop policy if exists orders_admin_all on public.orders;
create policy orders_admin_all on public.orders
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- A signed-in customer reads their own orders. src/app/account/page.tsx and
-- /api/account/orders both rely on this; without it the account order history
-- silently empties.
drop policy if exists orders_customer_read on public.orders;
create policy orders_customer_read on public.orders for select to authenticated
  using ((select auth.uid()) = customer_user_id);

-- Guest order tracking (/api/orders/track) uses the service role and needs no
-- anon policy here.

-- members -------------------------------------------------------------------
-- Writes arrive through the join_family RPC (security definer), reads through
-- supabaseAdmin. Nothing legitimately reads this table with a browser session.
drop policy if exists members_admin_all on public.members;
create policy members_admin_all on public.members
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- shop_staff ----------------------------------------------------------------
drop policy if exists staff_admin_all on public.shop_staff;
create policy staff_admin_all on public.shop_staff
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- The counter's own row, authorized through staff_authorizations by JWT email.
drop policy if exists staff_counter_read on public.shop_staff;
create policy staff_counter_read on public.shop_staff
  for select to authenticated using (public.is_authorized_counter(id));

-- ---------------------------------------------------------------------------
-- 3. Drop the anon SELECT grants these tables never needed.
-- ---------------------------------------------------------------------------
-- Step 1 already denies anon (RLS on, and every policy above is `to
-- authenticated`). Revoking the grant as well means a future `disable row level
-- security` cannot re-open the leak on its own — the failure mode becomes a
-- loud 42501 instead of a silent data dump.
revoke select on public.orders     from anon;
revoke select on public.members    from anon;
revoke select on public.shop_staff from anon;

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- Verify (expect 42501 "permission denied" for all three):
--
--   curl -s "$SUPABASE_URL/rest/v1/shop_staff?select=id&limit=1" \
--     -H "apikey: $PUBLISHABLE_KEY" -H "Authorization: Bearer $PUBLISHABLE_KEY"
--
-- Then confirm a signed-in customer still sees their orders at /account and a
-- cashier still reaches /BaebeCounter.
-- ---------------------------------------------------------------------------

-- =====================================================================
-- 20260807_counter_sale_order_item_columns.sql
-- Makes the till able to sell at all — order_items.unit_price is NOT NULL and the RPC never set it.
-- =====================================================================
-- Make counter sales actually complete.
--
-- WHY THIS EXISTS
-- ---------------
-- `public.order_items` is a legacy table carrying BOTH generations of price
-- column:
--
--     unit_price   numeric NOT NULL   -- legacy, no default
--     total_price  numeric NOT NULL   -- legacy, no default
--     price        numeric            -- newer, for BI/profit reporting
--     cost_price   numeric            -- newer, for BI/profit reporting
--
-- `complete_counter_sale` inserts only `price` and `cost_price`. Postgres
-- therefore rejects every row on `unit_price`, the whole function rolls back,
-- and the till answers 409:
--
--   null value in column "unit_price" of relation "order_items"
--   violates not-null constraint
--
-- That is not an edge case. It means NO counter sale has ever succeeded — not
-- for any cashier, product, or payment method. It is the real content of the
-- report that "BaebeCounter is very poor".
--
-- This exact bug was already found and fixed on the ONLINE path. See the
-- comment in src/app/api/paystack/initialize/route.ts:
--
--   "`unit_price` and `total_price` are NOT NULL with no default on the legacy
--    order_items table. Omitting them made every single online order fail
--    here: the order row was created, this insert threw, and the catch below
--    marked the order payment_failed. Production has zero order_items rows as
--    a result."
--
-- The counter RPC has the identical defect and was never fixed, in either the
-- original definition (20260721_z_commerce_foundation.sql) or the hardened one
-- (20260728_counter_sale_integrity.sql).
--
-- WHAT THIS CHANGES
-- -----------------
-- One statement inside the function: the `insert into public.order_items`
-- now supplies `unit_price` and `total_price` alongside `price` and
-- `cost_price`. Everything else — the authorization block, the idempotency
-- key, the inventory decrement, the availability roll-up, the audit row — is
-- reproduced verbatim from 20260728_counter_sale_integrity.sql.
--
-- `unit_price` is the per-unit price and `total_price` is unit × quantity,
-- matching how the online path fills them, so a receipt reads the same
-- whichever door the sale came through.
--
-- Safe to run more than once.

do $do$
declare
  v_body text;
begin
  -- Rewrite the function in place rather than restating 200 lines of logic
  -- that has already been reviewed once. Fetching the current body and
  -- patching the single broken statement keeps this migration honest about
  -- its own scope: if the surrounding logic has moved on, this fails loudly
  -- instead of silently reverting it.
  select pg_get_functiondef(p.oid)
  into v_body
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'complete_counter_sale'
  limit 1;

  if v_body is null then
    raise exception
      'complete_counter_sale not found. Apply 20260728_counter_sale_integrity.sql first.';
  end if;

  if position('unit_price' in v_body) > 0 then
    raise notice 'complete_counter_sale already sets unit_price; nothing to do.';
    return;
  end if;

  if position(
       'order_id, product_id, variant_id, product_name, quantity, price, cost_price'
       in v_body) = 0 then
    raise exception
      'complete_counter_sale does not contain the expected order_items insert. '
      'Reconcile by hand rather than letting this migration guess.';
  end if;

  v_body := replace(
    v_body,
    'order_id, product_id, variant_id, product_name, quantity, price, cost_price',
    'order_id, product_id, variant_id, product_name, quantity, unit_price, total_price, price, cost_price'
  );

  v_body := replace(
    v_body,
    'select v_order_id, variant.product_id, variant.id, product.name, item.quantity,
    variant.price, coalesce(variant.cost_price, 0)',
    'select v_order_id, variant.product_id, variant.id, product.name, item.quantity,
    variant.price, round(variant.price * item.quantity, 2),
    variant.price, coalesce(variant.cost_price, 0)'
  );

  if position('round(variant.price * item.quantity, 2)' in v_body) = 0 then
    raise exception
      'Could not patch the order_items SELECT list in complete_counter_sale. '
      'Its formatting has changed; reconcile by hand.';
  end if;

  execute v_body;
end
$do$;

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- Verify: ring up a sale at the till, then
--
--   select oi.product_name, oi.quantity, oi.unit_price, oi.total_price, oi.price
--   from public.order_items oi
--   join public.orders o on o.id = oi.order_id
--   where o.order_type = 'instore'
--   order by oi.created_at desc limit 5;
--
-- unit_price must equal price, and total_price must equal unit_price × quantity.
-- ---------------------------------------------------------------------------

-- =====================================================================
-- 20260806_z_variable_products.sql
-- Adds products.options + backfills it. The app already works without this; it is an improvement.
-- =====================================================================
-- WooCommerce-style variable products.
--
-- Variants already exist (`product_variants.option_values`, jsonb, shaped
-- `{"color":"Pink","size":"3M"}`). What does not exist is the product's own
-- ATTRIBUTE list — the "Colour: Pink, Blue" a seller declares before any
-- variant is generated. Without it the editor can only infer options from the
-- variants that happen to exist, so a seller cannot add a colour they have not
-- built yet, and a product whose variants are all switched off reads as simple.
--
-- WHY AN ARRAY AND NOT AN OBJECT
--   `[{"name":"Colour","values":["Pink","Blue"]}, {"name":"Size", …}]`
--
-- Postgres stores jsonb object keys sorted by (length, bytes). So
-- `{"color": …, "size": …}` reads back with `size` FIRST, and every picker on
-- the page renders in the wrong order — "3M · Pink" rather than "Pink · 3M".
-- That bug already shipped once in the till and had to be undone in
-- application code (src/domain/counter/grouping.ts, OPTION_ORDER). An array
-- preserves the seller's order, so it does not have to be guessed back.
--
-- WHY NO `product_type` COLUMN
-- A product is variable when `jsonb_array_length(options) > 0`. A second
-- column that says the same thing is a second column that can disagree.
--
--
-- PRE-FLIGHT CHECK BEFORE APPLYING — read this, it is not optional
-- ----------------------------------------------------------------
-- Confirm `public.products` has TABLE-level select granted to anon, not
-- column-level. Postgres does NOT extend column-level grants to columns added
-- later, so if the grant is per-column the storefront would read every product
-- with `options` missing — silently, with no error, and every variable product
-- would render as simple. `product_variants` IS granted per column
-- (20260721_z_commerce_foundation.sql:1540, deliberately, to keep cost_price
-- and barcode away from anon), so this is a live pattern in this database.
--
--   select grantee, privilege_type
--     from information_schema.table_privileges
--    where table_schema = 'public' and table_name = 'products';
--
--   select grantee, column_name
--     from information_schema.column_privileges
--    where table_schema = 'public' and table_name = 'products'
--      and grantee in ('anon', 'authenticated');
--
-- If the second query returns rows, add `options` to the column grant:
--   grant select (options) on public.products to anon, authenticated;

alter table public.products
  add column if not exists options jsonb not null default '[]'::jsonb;

comment on column public.products.options is
  'Attribute definitions, ordered: [{"name":"Colour","values":["Pink","Blue"]}]. An array because jsonb re-sorts object keys and every picker would render in the wrong order. Max 3 entries; variant option_values keys are the lowercased names.';

-- The shape check is deliberately shallow: it holds the array-ness and the cap
-- that the UI depends on, and leaves the per-entry rules to zod
-- (src/lib/admin/catalog-schemas.ts), which can say WHICH field is wrong.
alter table public.products
  drop constraint if exists products_options_shape;
alter table public.products
  add constraint products_options_shape check (
    jsonb_typeof(options) = 'array' and jsonb_array_length(options) <= 3
  );

-- Variant-specific imagery: the gallery filters by variant_id on every product
-- page, and this table is otherwise only indexed by (product_id, sort_order).
create index if not exists product_media_variant_idx
  on public.product_media(variant_id)
  where variant_id is not null;

-- BACKFILL (a): give the products that already have structured options their
-- attribute list.
--
-- This is the important half. Without it, the ten seeded products open in the
-- new editor as SIMPLE products, and the first save reconciles their real
-- variants against an empty option list — switching every one of them off.
-- Those rows cannot be deleted (purchase order lines are ON DELETE RESTRICT)
-- and their stock would have to be re-counted by hand.
--
-- Names come from the jsonb keys themselves, capitalised, so that
-- `optionKey(name)` still finds the key it was derived from. Colour leads,
-- then size, then anything else alphabetically — the same ranking the
-- application uses, so a product looks the same before and after this runs.
with variant_options as (
  select
    v.product_id,
    lower(trim(o.key)) as option_key,
    trim(o.value #>> '{}') as option_value,
    min(v.created_at) as first_seen
  from public.product_variants v
  -- The type guard lives INSIDE the lateral, not in WHERE: jsonb_each raises
  -- "cannot deconstruct a scalar" on a legacy row holding a bare string, and
  -- WHERE is not guaranteed to filter it out first.
  cross join lateral jsonb_each(
    case
      when jsonb_typeof(coalesce(v.option_values, '{}'::jsonb)) = 'object'
      then coalesce(v.option_values, '{}'::jsonb)
      else '{}'::jsonb
    end
  ) as o(key, value)
  where v.is_active
    and jsonb_typeof(o.value) = 'string'
    and coalesce(trim(o.value #>> '{}'), '') <> ''
    and coalesce(trim(o.key), '') <> ''
  group by 1, 2, 3
),
ranked as (
  select
    product_id,
    option_key,
    case
      when option_key in ('color', 'colour') then 0
      when option_key = 'size' then 1
      when option_key = 'material' then 2
      else 3
    end as option_rank,
    -- Not aliased `values`: that is a reserved word in Postgres.
    array_agg(option_value order by first_seen, option_value) as value_list
  from variant_options
  group by 1, 2
),
collected as (
  select
    product_id,
    jsonb_agg(
      jsonb_build_object('name', initcap(option_key), 'values', to_jsonb(value_list))
      order by option_rank, option_key
    ) as options
  from ranked
  group by product_id
  having count(*) <= 3
)
update public.products p
   set options = c.options
  from collected c
 where p.id = c.product_id
   -- Never overwrite a list a human has already curated.
   and coalesce(jsonb_array_length(p.options), 0) = 0;

-- BACKFILL (b): `products.price` is what the listing grid and every legacy
-- query read. On a variable product it should be the "from" price, not
-- whatever the first variant happened to cost when the row was created.
update public.products p
   set price = v.min_price
  from (
    select product_id, min(price) as min_price
      from public.product_variants
     where is_active
     group by product_id
  ) v
 where p.id = v.product_id
   and v.min_price is not null
   and p.price is distinct from v.min_price;

-- =====================================================================
-- 20260807_staff_login_domain.sql
-- Data-driven staff sign-in domains. Seeds BOTH the new domain and legacy .local, so nobody is locked out.
-- =====================================================================
-- Staff sign-in domains, as data rather than as literals inside a function.
--
-- WHY
-- ---
-- `is_staff_login_email()` decided whether an address belongs to a staff portal
-- with two hardcoded `like` patterns:
--
--     lower(p_email) like '%@admin.baebe-boo.local'
--     or lower(p_email) like '%@counter.baebe-boo.local'
--
-- The application derives that same suffix from NEXT_PUBLIC_SITE_URL now (see
-- src/lib/auth/login-domains.ts), so the two halves would silently disagree the
-- moment the site host changed: a cashier on the new domain would stop being
-- recognised as staff, and `request_login_code` would happily mint a CUSTOMER
-- session for a counter address. The list therefore lives in a table, and
-- adding or retiring a domain is an insert or a delete instead of a function
-- rewrite that has to be kept in sync with a deploy.
--
-- Both the retired `.local` pair and the real host are seeded, because staff
-- provisioned under the old suffix keep signing in until
-- scripts/backfill-staff-login-domain.mjs has moved them. Delete the
-- `is_legacy = true` rows once it has.
--
-- SAFE TO APPLY WHILE THE APP IS RUNNING. The application does not depend on
-- this migration: `isStaffLoginEmail()` in login-code.ts already covers both
-- suffixes in TypeScript and runs BEFORE this RPC, so an unapplied migration
-- degrades to the old behaviour rather than failing a request.

create table if not exists public.staff_login_domains (
  domain text primary key,
  portal text not null check (portal in ('admin', 'counter')),
  is_legacy boolean not null default false,
  created_at timestamptz not null default now()
);

comment on table public.staff_login_domains is
  'Email domains that identify a staff portal login. Kept in step with src/lib/auth/login-domains.ts.';

-- The row IS a security control: anyone who could insert here could make an
-- ordinary mailbox look like staff, or delete a row to make a staff address
-- look like a customer.
alter table public.staff_login_domains enable row level security;
revoke all on table public.staff_login_domains from anon, authenticated;
grant select on table public.staff_login_domains to service_role;

insert into public.staff_login_domains (domain, portal, is_legacy) values
  ('admin.baebe-boo.local', 'admin', true),
  ('counter.baebe-boo.local', 'counter', true),
  ('admin.baebe-boo.jtechinnovations.tech', 'admin', false),
  ('counter.baebe-boo.jtechinnovations.tech', 'counter', false)
on conflict (domain) do nothing;

-- Suffix comparison, not `like`: a domain is user-supplied data now, and `_`
-- and `%` are wildcards in a like pattern. `right()` also makes
-- "x@admin.baebe-boo.local.evil.com" a non-match, which a naive `like '%...'`
-- would already get right but a `position()` or `strpos()` rewrite would not.
create or replace function public.is_staff_login_domain(p_email text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
  select exists (
    select 1
    from public.staff_login_domains d
    where right(lower(coalesce(p_email, '')), length(d.domain) + 1) = '@' || lower(d.domain)
  );
$function$;

revoke all on function public.is_staff_login_domain(text) from public, anon, authenticated;
grant execute on function public.is_staff_login_domain(text) to service_role;

-- Addresses that must never receive a CUSTOMER session.
--
-- Unchanged from 20260805_customer_login_codes.sql apart from the first clause:
-- the admin_users lookup is still the important part, because
-- private.has_staff_role() and public.is_admin() both grant owner privileges to
-- ANY session whose JWT email matches an active boss row, regardless of how
-- that session was minted.
create or replace function public.is_staff_login_email(p_email text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
  select
    public.is_staff_login_domain(p_email)
    or exists (
      select 1 from public.admin_users
      where lower(email) = lower(p_email) and is_active = true
    )
    or exists (
      select 1
      from public.shop_staff s
      join auth.users u on u.id = s.auth_user_id
      where lower(u.email) = lower(p_email) and s.is_active = true
    )
    or exists (
      select 1 from auth.users u
      where lower(u.email) = lower(p_email)
        and (
          coalesce(u.raw_app_meta_data ->> 'staff_role', '') <> ''
          or coalesce(u.raw_app_meta_data ->> 'counter_staff_id', '') <> ''
        )
    );
$function$;

revoke all on function public.is_staff_login_email(text) from public, anon, authenticated;
grant execute on function public.is_staff_login_email(text) to service_role;

-- =====================================================================
-- 20260807_customer_merge_and_schedule.sql
-- members.user_id + the pg_cron campaign schedule. Needs pg_cron and pg_net enabled first.
-- =====================================================================
-- Merge the two customer records, and give the birthday campaign a scheduler.
--
-- WHY THIS EXISTS
-- ---------------
-- Baebe Boo kept customers in two places that never met:
--
--   public.members            the homepage "Join the family" form. Parent name,
--                             child name, phone, email, child's date of birth.
--                             No user_id, no auth user, no orders.
--   public.customer_profiles  created by the bootstrap_customer_account trigger
--                             the first time somebody signs in, with
--                             customer_children alongside it.
--
-- They were joined only by loose email matching at read time, so a customer who
-- signed in and shopped never appeared in admin unless they had ALSO filled in
-- the homepage form — while the CSV export button on that same screen read
-- report_top_customers, which is built from customer_profiles. One screen, two
-- answers.
--
-- This migration makes customer_profiles the single source of truth and gives
-- members a real foreign key to it. It also schedules the campaign dispatcher
-- from the database rather than from a host cron file, so it survives the move
-- to Vercel that this deployment is heading for.
--
-- SAFE TO RUN MORE THAN ONCE. It writes no customer data it cannot re-derive:
-- the only backfill here is the easy half (members whose email already has an
-- account). Minting auth users for the rest is scripts/backfill-customer-merge.mjs,
-- deliberately kept out of SQL because it has to go through the GoTrue admin API.
--
-- AFTER APPLYING:
--   1. node scripts/backfill-customer-merge.mjs            (dry run, prints a plan)
--   2. node scripts/backfill-customer-merge.mjs --apply    (does it)
--   3. Store the two Vault secrets named at the bottom of this file, or the
--      scheduled job will run and get a 401 every time.

-- ---------------------------------------------------------------------------
-- 1. members gains a real link to the account.
-- ---------------------------------------------------------------------------
alter table public.members
  add column if not exists user_id uuid references auth.users(id) on delete set null;

-- Not unique: a parent with three children has three members rows and one
-- account, which is exactly the shape the merge is supposed to produce.
create index if not exists members_user_id_idx on public.members(user_id);
-- Every lookup in the admin routes is by lower-cased email.
create index if not exists members_email_lower_idx on public.members(lower(email));

comment on column public.members.user_id is
  'The auth account this family lead belongs to. Null means the lead has never signed in; scripts/backfill-customer-merge.mjs mints the account.';

-- The easy half of the merge, and it is idempotent by construction.
update public.members m
set user_id = u.id
from auth.users u
where m.user_id is null
  and m.email is not null
  and lower(u.email) = lower(trim(m.email));

-- ---------------------------------------------------------------------------
-- 2. join_family writes the unified model going forward.
-- ---------------------------------------------------------------------------
-- Same signature as before, so src/app/api/family/join/route.ts is unchanged.
--
-- It deliberately does NOT create an auth user. This RPC is reachable from an
-- unauthenticated public form; minting accounts from there would let anyone
-- create an account for an address they do not control. It links to an account
-- that already exists, and leaves the rest to the backfill script, which runs
-- with the service key under a human.
create or replace function public.join_family(
  p_parent_name text,
  p_child_first_name text,
  p_child_last_name text,
  p_phone text,
  p_email text,
  p_child_date_of_birth date,
  p_policy_version text,
  p_source text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_member_id uuid;
  v_user_id uuid;
  v_email text := lower(trim(p_email));
  v_phone text := trim(p_phone);
begin
  if length(trim(p_parent_name)) = 0
    or length(trim(p_child_first_name)) = 0
    or length(trim(p_child_last_name)) = 0
    or length(v_phone) < 7
    or position('@' in v_email) < 2
    or length(trim(p_policy_version)) = 0
    or length(trim(p_source)) = 0 then
    raise exception 'Invalid family membership details';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_email || ':' || v_phone, 0));

  select id into v_user_id from auth.users where lower(email) = v_email limit 1;

  select id into v_member_id from public.members
  where lower(email) = v_email and phone = v_phone
  order by created_at limit 1;

  if v_member_id is null then
    insert into public.members (
      parent_name, child_first_name, child_last_name, phone, email,
      child_date_of_birth, user_id
    ) values (
      trim(p_parent_name), trim(p_child_first_name), trim(p_child_last_name),
      v_phone, v_email, p_child_date_of_birth, v_user_id
    ) returning id into v_member_id;
  elsif v_user_id is not null then
    update public.members set user_id = v_user_id
    where id = v_member_id and user_id is null;
  end if;

  -- Mirror into the source of truth when there is an account to mirror into.
  -- Blanks only: the profile is what the customer maintains from /account, and
  -- a form filled in on the homepage must not overwrite a correction they made
  -- there last week.
  if v_user_id is not null then
    insert into public.customer_profiles (user_id, email, full_name, phone)
    values (v_user_id, v_email, trim(p_parent_name), v_phone)
    on conflict (user_id) do update set
      full_name = coalesce(nullif(trim(customer_profiles.full_name), ''), excluded.full_name),
      phone     = coalesce(nullif(trim(customer_profiles.phone), ''), excluded.phone),
      updated_at = now();

    -- Date of birth is the identity: a nickname changes, a birthday does not.
    if not exists (
      select 1 from public.customer_children cc
      where cc.user_id = v_user_id
        and (
          cc.date_of_birth = p_child_date_of_birth
          or lower(coalesce(cc.first_name, '')) = lower(trim(p_child_first_name))
        )
    ) then
      insert into public.customer_children (user_id, first_name, date_of_birth)
      values (v_user_id, trim(p_child_first_name), p_child_date_of_birth);
    end if;
  end if;

  insert into public.customer_consents (
    email, phone, purpose, channel, status, policy_version, source
  ) values
    (v_email, v_phone, 'family_marketing', 'email', 'granted', trim(p_policy_version), trim(p_source)),
    (v_email, v_phone, 'family_marketing', 'whatsapp', 'granted', trim(p_policy_version), trim(p_source));

  return v_member_id;
end;
$function$;

revoke all on function public.join_family(text, text, text, text, text, date, text, text)
  from public, anon, authenticated;
grant execute on function public.join_family(text, text, text, text, text, date, text, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- 3. Birthdays, without the 29 February landmine.
-- ---------------------------------------------------------------------------
-- The previous build_birthday_campaign built the next birthday with
-- make_date(year, 2, 29), which RAISES "date field value out of range" in a
-- common year. One leap-day child in the table and the whole recipient preview
-- 500s. Clamping to the last day of the month gives 28 February, which is the
-- same answer src/domain/crm/birthday.ts gives in TypeScript.
create or replace function private.days_in(p_year int, p_month int)
returns int
language sql
immutable
set search_path = pg_catalog
as $function$
  select extract(day from (make_date(p_year, p_month, 1) + interval '1 month - 1 day'))::int;
$function$;

create or replace function private.next_anniversary(p_dob date, p_from date)
returns date
language sql
immutable
set search_path = pg_catalog, private
as $function$
  select case when this_year >= p_from then this_year else next_year end
  from (
    select
      make_date(y, m, least(d, private.days_in(y, m)))         as this_year,
      make_date(y + 1, m, least(d, private.days_in(y + 1, m))) as next_year
    from (
      select
        extract(year from p_from)::int as y,
        extract(month from p_dob)::int as m,
        extract(day from p_dob)::int   as d
    ) parts
  ) s;
$function$;

-- The recipient list now reads BOTH sources. customer_children is the
-- destination of the merge; members is where the children still live for every
-- lead the backfill has not converted yet. Reading both means the campaign
-- works the day this migration lands rather than the day the backfill finishes.
drop function if exists public.build_birthday_campaign(integer);
create or replace function public.build_birthday_campaign(p_days_ahead integer default 30)
returns table (
  user_id uuid,
  member_id uuid,
  email text,
  parent_name text,
  child_name text,
  child_date_of_birth date,
  days_until_birthday integer
)
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $function$
  with candidates as (
    select
      cp.user_id,
      null::uuid                as member_id,
      lower(trim(cp.email))     as email,
      cp.full_name              as parent_name,
      cc.first_name             as child_name,
      cc.date_of_birth          as child_dob
    from public.customer_children cc
    join public.customer_profiles cp on cp.user_id = cc.user_id
    where cc.date_of_birth is not null
      and coalesce(trim(cp.email), '') <> ''
    union all
    select
      m.user_id,
      m.id,
      lower(trim(m.email)),
      m.parent_name,
      nullif(trim(coalesce(m.child_first_name, '')), ''),
      m.child_date_of_birth
    from public.members m
    where m.child_date_of_birth is not null
      and coalesce(trim(m.email), '') <> ''
  ),
  dated as (
    select c.*, private.next_anniversary(c.child_dob, current_date) as birthday
    from candidates c
  )
  -- One email per mailbox per child. A parent in both tables must not be
  -- mailed twice, and the copy that knows the account wins because it is the
  -- one whose loyalty points can be credited.
  --
  -- Every reference below is qualified with `d.` on purpose: RETURNS TABLE puts
  -- user_id, email, parent_name and the rest in scope as OUT parameters, and an
  -- unqualified mention of any of them is "column reference is ambiguous" at
  -- CREATE FUNCTION time.
  select distinct on (d.email, d.child_dob)
    d.user_id,
    d.member_id,
    d.email,
    coalesce(d.parent_name, '') as parent_name,
    coalesce(d.child_name, '')  as child_name,
    d.child_dob                 as child_date_of_birth,
    (d.birthday - current_date)::int as days_until_birthday
  from dated d
  where (d.birthday - current_date) between 0 and greatest(coalesce(p_days_ahead, 30), 0)
  order by d.email, d.child_dob, (d.user_id is null), (d.birthday - current_date);
$function$;

revoke all on function public.build_birthday_campaign(integer) from public, anon;
grant execute on function public.build_birthday_campaign(integer) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. campaign_recipients: stop duplicating everyone without an account.
-- ---------------------------------------------------------------------------
-- The route upserted with onConflict "campaign_id, user_id" and user_id is
-- nullable. NULL is never equal to NULL in Postgres, so the constraint could
-- not fire for exactly the rows that duplicated, and every save re-inserted
-- every recipient who had no account.
-- Of each duplicate set, keep the row that already recorded a send. Deleting
-- that one and keeping an unsent twin would put the recipient straight back on
-- the dispatcher's work list, and mailing somebody twice is the failure mode
-- this whole section exists to stop.
delete from public.campaign_recipients cr
using (
  select id, row_number() over (
    partition by campaign_id, lower(trim(email))
    -- `nulls last` on an ascending sort puts a real sent_at first.
    order by sent_at nulls last, created_at, id
  ) as row_rank
  from public.campaign_recipients
) ranked
where ranked.id = cr.id and ranked.row_rank > 1;

update public.campaign_recipients
set email = lower(trim(email))
where email <> lower(trim(email));

alter table public.campaign_recipients
  drop constraint if exists campaign_recipients_campaign_id_user_id_key;

create unique index if not exists campaign_recipients_campaign_email_key
  on public.campaign_recipients (campaign_id, email);

-- The cron's work list is "not sent yet", so index exactly that.
create index if not exists campaign_recipients_pending_idx
  on public.campaign_recipients (campaign_id)
  where sent_at is null;

-- ---------------------------------------------------------------------------
-- 5. campaigns: room to record why a send did not happen.
-- ---------------------------------------------------------------------------
-- A simulated send is a success that delivers nothing. The app now refuses to
-- stamp status='sent' for one, and needs somewhere to say so — otherwise the
-- only evidence is an HTTP response nobody kept.
alter table public.campaigns add column if not exists last_error text;
alter table public.campaigns add column if not exists last_attempted_at timestamptz;

comment on column public.campaigns.last_error is
  'Why the most recent send attempt did not complete, in the words the admin screen shows. Null when the last attempt succeeded.';
comment on column public.campaigns.scheduled_at is
  'When the dispatcher should send this campaign. Only read for status = ''ready''; a draft is never sent automatically.';

-- The dispatcher's candidate set.
create index if not exists campaigns_due_idx
  on public.campaigns (scheduled_at)
  where status = 'ready';

-- ---------------------------------------------------------------------------
-- 6. Schedule the dispatcher from the database.
-- ---------------------------------------------------------------------------
-- WHY IN THE DATABASE. There is no cron in this repo and no scheduler of any
-- kind: campaigns.scheduled_at was written and never read by anything. A host
-- crontab would work today and vanish the moment this deployment moves to
-- Vercel, so the schedule lives next to the data it acts on.
--
-- WHY EVERY 15 MINUTES. pg_net is fire-and-forget: it queues the request and
-- cannot retry on error, and the response lands in net._http_response rather
-- than anywhere the job can branch on. A single daily tick that failed would
-- simply skip that day's birthdays. Twelve ticks across the 07:00-09:59 window
-- means eleven more chances, which only works because the endpoint is
-- idempotent (campaign_recipients.sent_at is null is the work list) and
-- batched (it returns {sent, remaining} and the next tick picks up the rest).
--
-- Ghana is UTC+0 all year and Postgres cron expressions are evaluated in the
-- server's timezone, so 7-9 here is 7-9 in Accra with no conversion.
--
-- WHY VAULT. cron.job.command is readable by anyone who can read the cron
-- schema, so an inline bearer token would be a shared secret sitting in a
-- table. Vault keeps it encrypted and the job body only names it.
do $do$
begin
  create extension if not exists pg_cron;
exception when others then
  raise notice 'pg_cron unavailable (%). Enable it from the Supabase dashboard, then re-run this file.', sqlerrm;
end
$do$;

do $do$
begin
  create extension if not exists pg_net;
exception when others then
  raise notice 'pg_net unavailable (%). Enable it from the Supabase dashboard, then re-run this file.', sqlerrm;
end
$do$;

-- Store these once, by hand, before the first tick:
--
--   select vault.create_secret(
--     'https://baebe-boo.jtechinnovations.tech', 'baebe_boo_site_url',
--     'Origin the campaign dispatcher calls. No trailing slash.');
--   select vault.create_secret(
--     '<the same value as CRON_SECRET in the app env>', 'baebe_boo_cron_secret',
--     'Bearer token for GET /api/cron/campaigns.');
--
-- To rotate: select vault.update_secret(id, new_value) — the job body does not change.
do $do$
begin
  perform cron.schedule(
    'baebe-boo-campaign-dispatch',
    '*/15 7-9 * * *',
    $job$
      select net.http_get(
        url := (select decrypted_secret from vault.decrypted_secrets where name = 'baebe_boo_site_url')
               || '/api/cron/campaigns',
        headers := jsonb_build_object(
          'Authorization',
          'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'baebe_boo_cron_secret')
        ),
        timeout_milliseconds := 25000
      );
    $job$
  );
exception when others then
  raise notice 'Could not schedule baebe-boo-campaign-dispatch (%). Schedule it by hand once pg_cron and pg_net are enabled.', sqlerrm;
end
$do$;

-- =====================================================================
-- Verification. Every row should read OK.
-- =====================================================================
select 'RLS on orders'        as check,
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
 where table_schema = 'public' and table_name = 'products' and column_name = 'options'
union all
select 'staff_login_domains seeded',
       case when count(*) >= 4 then 'OK' else 'FAILED' end
  from public.staff_login_domains
union all
select 'members.user_id exists',
       case when count(*) = 1 then 'OK' else 'FAILED' end
  from information_schema.columns
 where table_schema = 'public' and table_name = 'members' and column_name = 'user_id';

-- 20260909_sms_campaigns.sql
alter table public.campaign_recipients
  add column if not exists sms_sent_at timestamptz;
create index if not exists campaign_recipients_sms_pending_idx
  on public.campaign_recipients (campaign_id)
  where sms_sent_at is null;

-- 20260909_sms_notifications.sql
alter table public.orders
  add column if not exists confirmation_sms_sent_at timestamptz;
create index if not exists orders_confirmation_sms_pending_idx
  on public.orders (id)
  where confirmation_sms_sent_at is null;
