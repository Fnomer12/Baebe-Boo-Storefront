-- Phase 4: CRM campaigns and customer intelligence helpers.

create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  campaign_type text not null check (campaign_type in ('birthday', 'vaccination', 'reengagement', 'custom')),
  status text not null default 'draft' check (status in ('draft', 'ready', 'sent', 'cancelled')),
  scheduled_at timestamptz,
  sent_at timestamptz,
  audience_count integer not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.campaign_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  email text not null,
  metadata jsonb not null default '{}'::jsonb,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (campaign_id, user_id)
);

create index if not exists campaigns_type_idx on public.campaigns(campaign_type, status);
create index if not exists campaign_recipients_campaign_idx on public.campaign_recipients(campaign_id);

-- Function to build a birthday campaign recipient list for children with birthdays in the next N days.
create or replace function public.build_birthday_campaign(p_days_ahead integer default 30)
returns table (
  user_id uuid,
  email text,
  parent_name text,
  child_name text,
  days_until_birthday integer
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    cp.user_id,
    cp.email,
    cp.full_name as parent_name,
    cc.first_name as child_name,
    case
      when make_date(
        extract(year from current_date)::int,
        extract(month from cc.date_of_birth)::int,
        extract(day from cc.date_of_birth)::int
      ) < current_date
      then (make_date(
        extract(year from current_date)::int + 1,
        extract(month from cc.date_of_birth)::int,
        extract(day from cc.date_of_birth)::int
      ) - current_date)::int
      else (make_date(
        extract(year from current_date)::int,
        extract(month from cc.date_of_birth)::int,
        extract(day from cc.date_of_birth)::int
      ) - current_date)::int
    end as days_until_birthday
  from public.customer_children cc
  join public.customer_profiles cp on cp.user_id = cc.user_id
  where cc.date_of_birth is not null
    and cp.email is not null
    and (
      case
        when make_date(
          extract(year from current_date)::int,
          extract(month from cc.date_of_birth)::int,
          extract(day from cc.date_of_birth)::int
        ) < current_date
        then make_date(
          extract(year from current_date)::int + 1,
          extract(month from cc.date_of_birth)::int,
          extract(day from cc.date_of_birth)::int
        )
        else make_date(
          extract(year from current_date)::int,
          extract(month from cc.date_of_birth)::int,
          extract(day from cc.date_of_birth)::int
        )
      end - current_date
    ) between 0 and p_days_ahead
  order by days_until_birthday;
$$;

revoke all on function public.build_birthday_campaign(integer) from public;
grant execute on function public.build_birthday_campaign(integer) to authenticated, service_role;

-- Triggers for updated_at.
create or replace function private.touch_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $do$
declare
  v_table text;
begin
  foreach v_table in array array['campaigns']
  loop
    execute format('drop trigger if exists set_updated_at on public.%I', v_table);
    execute format(
      'create trigger set_updated_at before update on public.%I for each row execute function private.touch_updated_at()',
      v_table
    );
  end loop;
end
$do$;

-- RLS policies.
alter table public.campaigns enable row level security;
alter table public.campaign_recipients enable row level security;

drop policy if exists campaigns_admin_all on public.campaigns;
create policy campaigns_admin_all on public.campaigns
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists campaign_recipients_admin_all on public.campaign_recipients;
create policy campaign_recipients_admin_all on public.campaign_recipients
  for all to authenticated using (
    exists (select 1 from public.campaigns c where c.id = campaign_id and public.is_admin())
  ) with check (
    exists (select 1 from public.campaigns c where c.id = campaign_id and public.is_admin())
  );
