-- Link a counter staff record to the Supabase Auth user that signs in as them.
--
-- supabase-js v2 has no `getUserByEmail`, so without this column the only way
-- to find a cashier's login is to page `auth.admin.listUsers()` over every
-- customer in the project. Storing the id makes password resets, code
-- rotations and access revocation a single call.
--
-- Precedent for altering this legacy table: 20260727_admin_bi_and_profit.sql
-- adds `orders.staff_id` the same way.

alter table public.shop_staff
  add column if not exists auth_user_id uuid references auth.users(id) on delete set null;

-- Partial, so the many legacy rows that have no login yet do not collide.
create unique index if not exists shop_staff_auth_user_uidx
  on public.shop_staff(auth_user_id)
  where auth_user_id is not null;

-- No column-level revoke here: a column REVOKE does not override the
-- table-level SELECT grant Supabase gives `authenticated`, so it would read
-- like protection without being any. Row access is already narrowed by the
-- existing RLS policy on shop_staff, and the value is the caller's own
-- auth.users id, which their JWT already carries.

notify pgrst, 'reload schema';
