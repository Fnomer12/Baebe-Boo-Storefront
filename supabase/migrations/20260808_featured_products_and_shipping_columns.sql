-- Featured products + the shipping columns transition_order already writes.
--
-- WHY THIS EXISTS
-- ---------------
-- 1. The homepage "Family favourites" section had no merchandising control:
--    it showed best-sellers or a category heuristic. `products.is_featured`
--    lets the admin pin products onto the homepage explicitly.
-- 2. `transition_order` (20260721_z_commerce_foundation.sql) updates
--    `orders.shipping_status`, `shipped_at` and `delivered_at`, but the
--    remote-only legacy `orders` table never had those columns, so every
--    admin dispatch/shipped/delivered transition errored. Adding them heals
--    the function without changing it. Order tracking derives its display
--    state from `order_status` and treats these as optional either way.
--
-- Safe to run more than once: every statement is add-if-not-exists.

alter table public.products
  add column if not exists is_featured boolean not null default false;

-- Partial index: the storefront homepage reads only featured actives.
create index if not exists products_featured_idx
  on public.products (created_at desc)
  where is_featured and is_active;

alter table public.orders
  add column if not exists shipping_status text;

alter table public.orders
  add column if not exists shipped_at timestamptz;

alter table public.orders
  add column if not exists delivered_at timestamptz;
