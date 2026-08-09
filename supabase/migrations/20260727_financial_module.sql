-- Phase 3: Financial module.
-- Expense categories and expense tracking by branch.

create table if not exists public.expense_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.expense_categories(id) on delete restrict,
  shop_id uuid references public.shops(id) on delete set null,
  amount numeric(12,2) not null check (amount >= 0),
  expense_date date not null default current_date,
  note text,
  receipt_url text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists expenses_category_idx on public.expenses(category_id);
create index if not exists expenses_shop_idx on public.expenses(shop_id);
create index if not exists expenses_date_idx on public.expenses(expense_date desc);

-- Seed default categories aligned with the client's requirements.
insert into public.expense_categories (name, description)
values
  ('Rent', 'Shop or office rent'),
  ('Salaries', 'Staff salaries and wages'),
  ('Electricity', 'Electricity bills'),
  ('Water', 'Water bills'),
  ('Internet', 'Internet and connectivity'),
  ('Fuel', 'Fuel for delivery or operations'),
  ('Delivery', 'Third-party delivery fees'),
  ('Other', 'Miscellaneous expenses')
on conflict (name) do nothing;

-- Summary view for the finance dashboard.
create or replace view public.expense_summary as
select
  ec.id as category_id,
  ec.name as category_name,
  date_trunc('month', e.expense_date)::date as month,
  e.shop_id,
  s.name as shop_name,
  coalesce(sum(e.amount), 0) as total_amount,
  count(e.id) as expense_count
from public.expense_categories ec
left join public.expenses e on e.category_id = ec.id
left join public.shops s on s.id = e.shop_id
group by ec.id, ec.name, date_trunc('month', e.expense_date)::date, e.shop_id, s.name;

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
  foreach v_table in array array['expenses']
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
alter table public.expense_categories enable row level security;
alter table public.expenses enable row level security;

drop policy if exists expense_categories_admin_all on public.expense_categories;
create policy expense_categories_admin_all on public.expense_categories
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists expenses_admin_all on public.expenses;
create policy expenses_admin_all on public.expenses
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

grant select on public.expense_summary to authenticated;
