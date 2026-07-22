-- Keep the admin login contract compatible with the production setup guide.
-- Newer staff roles use app_metadata.staff_role; legacy deployments seed
-- public.admin_users(role = 'boss'). Both must authorize the admin portal.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $function$
  select
    coalesce(auth.jwt() -> 'app_metadata' ->> 'staff_role', '') = 'owner'
    or exists (
      select 1
      from public.admin_users
      where lower(email) = lower(auth.jwt() ->> 'email')
        and role = 'boss'
        and is_active = true
    );
$function$;

revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated, service_role;
