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
