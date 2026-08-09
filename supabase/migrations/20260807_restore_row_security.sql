-- Remove the legacy "allow everything" policies from the public schema.
--
-- WHY THIS EXISTS
-- ---------------
-- An anon probe with the *publishable* key — the one shipped in every browser
-- bundle — returned real customer rows. The first guess was that RLS had been
-- switched off. It has not: `relrowsecurity` is true on all three tables.
--
-- The actual cause is worse. Postgres RLS policies are PERMISSIVE by default,
-- which means they are OR'd together: one policy of `USING (true)` for `public`
-- or `anon` defeats every carefully-scoped policy beside it. This database has
-- 29 of them, left over from before `20260721_production_security.sql` was
-- written. That migration ADDED correct policies but never DROPPED the old
-- ones, so the old ones simply kept winning.
--
-- What the publishable key could do before this file:
--
--   shop_staff                 ALL      public  true   -- grant yourself a till login
--   shops                      ALL      public  true
--   products                   UPDATE   public  true   -- change any price
--   products                   DELETE   public  true   -- delete the catalogue
--   product_shop_availability  UPDATE   anon    true   -- rewrite stock counts
--   orders                     UPDATE   anon    true   -- mark an order paid
--   members                    DELETE   public  true   -- delete customers
--   members / orders / order_items  SELECT  anon  true -- read all PII
--
-- The `shop_staff` one is the sharpest: with an ALL policy on that table, an
-- anonymous caller can insert a row pointing `auth_user_id` at their own
-- account and walk into the counter.
--
-- WHAT THIS CHANGES
-- -----------------
-- Drops every one of those policies by name and leaves the scoped ones in
-- place. Nothing the application does is lost, because every write to
-- `orders`, `order_items`, `members` and `shop_staff` goes through the
-- service-role client in an API route (verified across the whole codebase —
-- there is not one browser-side write anywhere), and the storefront's reads
-- are already served by the gated policies that stay:
--
--   products_public_read          USING (is_active = true)
--   shops_public_read             USING (is_active = true)
--   availability_public_read      USING (is_available = true)
--   product_variants_public_read  active variant of an active product
--   product_media_public_read     active media of an active product
--
-- Note those gated policies are strictly better than the ones being dropped:
-- "Allow read products" had no `is_active` check at all, so archived products
-- were public too.
--
-- Safe to run more than once.

-- ---------------------------------------------------------------------------
-- 1. Staff and shops — the privilege-escalation pair.
-- ---------------------------------------------------------------------------
drop policy if exists "Allow all operations on shop_staff" on public.shop_staff;
drop policy if exists "Allow all operations on shops"      on public.shops;

-- ---------------------------------------------------------------------------
-- 2. Catalogue writes. The admin writes these with the service role.
-- ---------------------------------------------------------------------------
drop policy if exists "Allow insert products"  on public.products;
drop policy if exists "Allow update products"  on public.products;
drop policy if exists "Allow delete products"  on public.products;
-- Ungated read: exposed archived products. `products_public_read` replaces it.
drop policy if exists "Allow read products"    on public.products;

drop policy if exists "Allow insert product availability" on public.product_shop_availability;
drop policy if exists "Allow delete availability"         on public.product_shop_availability;
drop policy if exists "storefront_update_stock"           on public.product_shop_availability;
-- Both ungated reads; `availability_public_read` replaces them.
drop policy if exists "Allow read product availability"   on public.product_shop_availability;
drop policy if exists "storefront_read_stock"             on public.product_shop_availability;

-- ---------------------------------------------------------------------------
-- 3. Orders. Created and updated exclusively by the service role
--    (src/app/api/paystack/**, src/lib/orders/**, the counter RPC).
-- ---------------------------------------------------------------------------
drop policy if exists "Allow frontend to read orders"          on public.orders;
drop policy if exists "admin_read_orders"                      on public.orders;
drop policy if exists "Allow admin to update orders"           on public.orders;
drop policy if exists "admin_update_orders"                    on public.orders;
drop policy if exists "Allow online customers to create orders" on public.orders;
drop policy if exists "storefront_insert_orders"               on public.orders;

drop policy if exists "Allow frontend to read order items"           on public.order_items;
drop policy if exists "admin_read_order_items"                       on public.order_items;
drop policy if exists "Allow online customers to create order items" on public.order_items;
drop policy if exists "storefront_insert_order_items"                on public.order_items;

-- ---------------------------------------------------------------------------
-- 4. Members. Written through the `join_family` RPC, which is SECURITY
--    DEFINER and therefore needs no policy of its own.
-- ---------------------------------------------------------------------------
drop policy if exists "Allow admin read members"          on public.members;
drop policy if exists "Allow boss read members"           on public.members;
drop policy if exists "Allow admin delete members"        on public.members;
drop policy if exists "Allow boss delete members"         on public.members;
drop policy if exists "Allow public member insert"        on public.members;
drop policy if exists "Allow public member registration"  on public.members;

-- ---------------------------------------------------------------------------
-- 5. Belt and braces: RLS on, and the scoped policies asserted.
-- ---------------------------------------------------------------------------
alter table public.orders      enable row level security;
alter table public.order_items enable row level security;
alter table public.members     enable row level security;
alter table public.shop_staff  enable row level security;
alter table public.shops       enable row level security;
alter table public.products    enable row level security;

drop policy if exists orders_admin_all on public.orders;
create policy orders_admin_all on public.orders
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- A signed-in customer reads their own orders. /account depends on this.
drop policy if exists orders_customer_read on public.orders;
create policy orders_customer_read on public.orders for select to authenticated
  using ((select auth.uid()) = customer_user_id);

drop policy if exists order_items_admin_all on public.order_items;
create policy order_items_admin_all on public.order_items
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists order_items_customer_read on public.order_items;
create policy order_items_customer_read on public.order_items for select to authenticated
  using (exists (
    select 1 from public.orders o
     where o.id = order_id and o.customer_user_id = (select auth.uid())
  ));

drop policy if exists members_admin_all on public.members;
create policy members_admin_all on public.members
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists staff_admin_all on public.shop_staff;
create policy staff_admin_all on public.shop_staff
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- The cashier's own row, authorized through staff_authorizations by JWT email.
drop policy if exists staff_counter_read on public.shop_staff;
create policy staff_counter_read on public.shop_staff
  for select to authenticated using (public.is_authorized_counter(id));

-- ---------------------------------------------------------------------------
-- 6. Drop the anon SELECT grants these tables never needed.
--
-- With the policies above, anon is already denied. Revoking the grant as well
-- means a future stray policy cannot re-open the hole on its own: the failure
-- becomes a loud 42501 instead of a silent data dump.
-- ---------------------------------------------------------------------------
revoke select on public.orders      from anon;
revoke select on public.order_items from anon;
revoke select on public.members     from anon;
revoke select on public.shop_staff  from anon;

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- Verify with the PUBLISHABLE key (not the service key):
--
--   curl -s "$URL/rest/v1/shop_staff?select=id&limit=1" \
--     -H "apikey: $PUBLISHABLE" -H "Authorization: Bearer $PUBLISHABLE"
--
-- Expect 42501 for shop_staff, orders, order_items and members; and the
-- storefront must still list products, shops and stock.
-- ---------------------------------------------------------------------------
