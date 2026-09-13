-- Counter staff must not count as customers.
--
-- WHY THIS EXISTS
-- ---------------
-- Every `auth.users` row gets a `customer_profiles` + `reward_accounts` row
-- from the `bootstrap_customer_account` trigger — including the synthetic
-- `xxx@counter.<host>` logins provisioned for cashiers (and the legacy
-- `*.baebe-boo.local` ones). Each till login therefore showed up in the admin
-- customer list, the top-customers report/export, campaign audiences, and the
-- till member lookup, and could even earn loyalty points.
--
-- This migration does two things:
--   1. Guards the trigger so newly provisioned staff logins never mint
--      customer rows. Staff auth itself is untouched — only the profile and
--      reward inserts are skipped.
--   2. Removes the customer rows already minted for staff. Family data
--      (`members`, `customer_children`, `customer_consents`) is deliberately
--      left alone: a cashier who shops with a personal email is a genuine
--      customer, and only the till login rows go.
--
-- Idempotent: safe to re-run.

-- 1. New staff logins skip customer bootstrap.
create or replace function private.bootstrap_customer_account()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
begin
  -- `shop_staff.auth_user_id` is linked AFTER the auth user is created, so
  -- the shop_staff clause of `is_staff_login_email` cannot match yet. The
  -- staff-domain and app-metadata clauses cover every provisioning path:
  -- `provisionCounterUser` sets `counter_staff_id`, the admin script sets
  -- `staff_role`, and both use derived staff-domain addresses.
  if public.is_staff_login_email(new.email)
    or coalesce(new.raw_app_meta_data ->> 'staff_role', '') <> ''
    or coalesce(new.raw_app_meta_data ->> 'counter_staff_id', '') <> ''
  then
    return new;
  end if;
  insert into public.customer_profiles (user_id, email, full_name)
  values (new.id, lower(new.email), nullif(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (user_id) do nothing;
  insert into public.reward_accounts (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$function$;

-- 2. Remove customer rows already minted for staff logins.
-- Reward rows first (no FK between the two, but delete order reads better).
delete from public.reward_accounts ra
using public.customer_profiles cp
where ra.user_id = cp.user_id
  and public.is_staff_login_email(cp.email);

delete from public.customer_profiles
where public.is_staff_login_email(email);

-- Staff rows whose auth email was later renamed outside the staff domains.
delete from public.reward_accounts
where user_id in (select auth_user_id from public.shop_staff where auth_user_id is not null);

delete from public.customer_profiles
where user_id in (select auth_user_id from public.shop_staff where auth_user_id is not null);
