-- Site-wide storefront settings (key/value so future flags need no DDL).
--
-- `store_ready` drives the "store not ready" banner on the main website:
-- true  = shop is live, no banner (default, preserves current behaviour).
-- false = visitors see a banner that the store is still being set up.
-- Toggled from BaebeAdmin → Products ("Store live" switch).

create table if not exists public.site_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

insert into public.site_settings (key, value)
values ('store_ready', 'true'::jsonb)
on conflict (key) do nothing;

alter table public.site_settings enable row level security;

drop policy if exists site_settings_service_all on public.site_settings;
create policy site_settings_service_all on public.site_settings
  for all to service_role using (true) with check (true);

drop policy if exists site_settings_admin_all on public.site_settings;
create policy site_settings_admin_all on public.site_settings
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- The storefront banner is visible to signed-out visitors, so the flag itself
-- must be world-readable. Values are booleans/labels only — never secrets.
drop policy if exists site_settings_public_read on public.site_settings;
create policy site_settings_public_read on public.site_settings
  for select to anon, authenticated using (true);
