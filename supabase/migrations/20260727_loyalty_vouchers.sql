-- Phase 6: Loyalty earning rules, gift vouchers, and voucher redemptions.

create table if not exists public.gift_vouchers (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  initial_value numeric(12,2) not null check (initial_value > 0),
  balance numeric(12,2) not null check (balance >= 0),
  currency text not null default 'GHS',
  recipient_email text,
  sender_user_id uuid references auth.users(id) on delete set null,
  message text,
  status text not null default 'active' check (status in ('active', 'redeemed', 'expired', 'cancelled')),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (balance <= initial_value)
);

create table if not exists public.voucher_redemptions (
  id uuid primary key default gen_random_uuid(),
  voucher_id uuid not null references public.gift_vouchers(id) on delete restrict,
  order_id uuid not null references public.orders(id) on delete restrict,
  amount numeric(12,2) not null check (amount > 0),
  created_at timestamptz not null default now(),
  unique (voucher_id, order_id)
);

create table if not exists public.loyalty_rules (
  id uuid primary key default gen_random_uuid(),
  event_type text unique not null check (event_type in ('purchase', 'referral', 'review', 'birthday', 'social_share')),
  points bigint not null check (points > 0),
  is_active boolean not null default true,
  updated_at timestamptz not null default now()
);

insert into public.loyalty_rules (event_type, points) values
  ('purchase', 100),
  ('referral', 500),
  ('review', 200),
  ('birthday', 300),
  ('social_share', 50)
on conflict (event_type) do update set
  points = excluded.points,
  updated_at = now();

-- Add voucher columns to orders for checkout integration.
alter table public.orders
  add column if not exists voucher_code text,
  add column if not exists voucher_credit numeric(12,2) default 0 check (voucher_credit >= 0);

-- Gift voucher creation helper (admin / service role).
create or replace function public.create_gift_voucher(
  p_initial_value numeric,
  p_currency text default 'GHS',
  p_recipient_email text default null,
  p_sender_user_id uuid default null,
  p_message text default null,
  p_expires_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_code text;
  v_id uuid;
begin
  if coalesce(p_initial_value, 0) <= 0 then
    raise exception 'Initial value must be greater than zero';
  end if;

  v_code := upper(substring(md5(random()::text || clock_timestamp()::text) from 1 for 12));

  insert into public.gift_vouchers (
    code, initial_value, balance, currency, recipient_email, sender_user_id, message, expires_at
  ) values (
    v_code, p_initial_value, p_initial_value, coalesce(nullif(p_currency, ''), 'GHS'),
    nullif(lower(trim(coalesce(p_recipient_email, ''))), ''),
    p_sender_user_id,
    nullif(p_message, ''),
    p_expires_at
  )
  returning id into v_id;

  return v_id;
end;
$function$;

-- Gift voucher balance lookup.
create or replace function public.get_voucher_balance(p_code text)
returns table (
  id uuid,
  balance numeric,
  status text,
  expires_at timestamptz,
  recipient_email text,
  sender_user_id uuid
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
  select
    v.id,
    v.balance,
    v.status,
    v.expires_at,
    v.recipient_email,
    v.sender_user_id
  from public.gift_vouchers v
  where lower(v.code) = lower(p_code);
$function$;

-- Gift voucher redemption helper.
create or replace function public.redeem_voucher(
  p_code text,
  p_user_id uuid,
  p_order_id uuid,
  p_amount numeric
)
returns numeric
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_voucher public.gift_vouchers%rowtype;
  v_redeemed numeric(12,2);
  v_existing numeric;
begin
  if coalesce(p_amount, 0) <= 0 then
    raise exception 'Redemption amount must be greater than zero';
  end if;

  select * into v_voucher
  from public.gift_vouchers
  where lower(code) = lower(p_code)
  for update;

  if v_voucher.id is null then
    raise exception 'Voucher not found';
  end if;

  if v_voucher.status = 'cancelled' then
    raise exception 'Voucher has been cancelled';
  end if;

  if v_voucher.status = 'expired' or (v_voucher.expires_at is not null and v_voucher.expires_at < now()) then
    raise exception 'Voucher has expired';
  end if;

  if v_voucher.recipient_email is not null then
    if not exists (
      select 1 from auth.users
      where id = p_user_id and lower(email) = v_voucher.recipient_email
    ) then
      raise exception 'Voucher is restricted to a different recipient email';
    end if;
  end if;

  v_redeemed := least(v_voucher.balance, p_amount);
  if v_redeemed <= 0 then
    raise exception 'Voucher has no remaining balance';
  end if;

  select coalesce(sum(amount), 0) into v_existing
  from public.voucher_redemptions
  where voucher_id = v_voucher.id and order_id = p_order_id;

  if v_existing > 0 then
    raise exception 'Voucher already redeemed for this order';
  end if;

  insert into public.voucher_redemptions (voucher_id, order_id, amount)
  values (v_voucher.id, p_order_id, v_redeemed);

  update public.gift_vouchers
  set balance = balance - v_redeemed,
      status = case when balance - v_redeemed <= 0 then 'redeemed' else status end,
      updated_at = now()
  where id = v_voucher.id;

  return v_redeemed;
end;
$function$;

revoke all on function public.create_gift_voucher(numeric, text, text, uuid, text, timestamptz) from public, anon, authenticated;
revoke all on function public.get_voucher_balance(text) from public, anon, authenticated;
revoke all on function public.redeem_voucher(text, uuid, uuid, numeric) from public, anon, authenticated;

grant execute on function public.create_gift_voucher(numeric, text, text, uuid, text, timestamptz) to service_role;
grant execute on function public.get_voucher_balance(text) to service_role;
grant execute on function public.redeem_voucher(text, uuid, uuid, numeric) to service_role;

-- Indexes and triggers.
create index if not exists gift_vouchers_code_idx on public.gift_vouchers(lower(code));
create index if not exists gift_vouchers_sender_idx on public.gift_vouchers(sender_user_id);
create index if not exists gift_vouchers_recipient_idx on public.gift_vouchers(recipient_email);
create index if not exists voucher_redemptions_voucher_idx on public.voucher_redemptions(voucher_id);
create index if not exists voucher_redemptions_order_idx on public.voucher_redemptions(order_id);

drop trigger if exists set_updated_at on public.gift_vouchers;
create trigger set_updated_at before update on public.gift_vouchers
  for each row execute function private.touch_updated_at();

drop trigger if exists set_updated_at on public.loyalty_rules;
create trigger set_updated_at before update on public.loyalty_rules
  for each row execute function private.touch_updated_at();

-- Row level security.
alter table public.gift_vouchers enable row level security;
alter table public.voucher_redemptions enable row level security;
alter table public.loyalty_rules enable row level security;

drop policy if exists gift_vouchers_admin_all on public.gift_vouchers;
create policy gift_vouchers_admin_all on public.gift_vouchers
  for all to authenticated
  using (private.has_staff_role(ARRAY['owner','manager']))
  with check (private.has_staff_role(ARRAY['owner','manager']));

drop policy if exists voucher_redemptions_admin_all on public.voucher_redemptions;
create policy voucher_redemptions_admin_all on public.voucher_redemptions
  for all to authenticated
  using (private.has_staff_role(ARRAY['owner','manager']))
  with check (private.has_staff_role(ARRAY['owner','manager']));

drop policy if exists loyalty_rules_admin_all on public.loyalty_rules;
create policy loyalty_rules_admin_all on public.loyalty_rules
  for all to authenticated
  using (private.has_staff_role(ARRAY['owner','manager']))
  with check (private.has_staff_role(ARRAY['owner','manager']));

drop policy if exists gift_vouchers_customer_read on public.gift_vouchers;
create policy gift_vouchers_customer_read on public.gift_vouchers for select to authenticated
  using (
    sender_user_id = (select auth.uid())
    or recipient_email = lower(auth.jwt() ->> 'email')
    or exists (
      select 1 from public.voucher_redemptions vr
      join public.orders o on o.id = vr.order_id
      where vr.voucher_id = gift_vouchers.id and o.customer_user_id = (select auth.uid())
    )
  );

drop policy if exists voucher_redemptions_customer_read on public.voucher_redemptions;
create policy voucher_redemptions_customer_read on public.voucher_redemptions for select to authenticated
  using (
    exists (
      select 1 from public.gift_vouchers v
      where v.id = voucher_redemptions.voucher_id
        and (
          v.sender_user_id = (select auth.uid())
          or v.recipient_email = lower(auth.jwt() ->> 'email')
        )
    )
    or exists (
      select 1 from public.orders o
      where o.id = voucher_redemptions.order_id and o.customer_user_id = (select auth.uid())
    )
  );

drop policy if exists loyalty_rules_public_read on public.loyalty_rules;
create policy loyalty_rules_public_read on public.loyalty_rules for select to authenticated
  using (true);

-- Service role bypass helper for admin APIs.
drop policy if exists gift_vouchers_service_all on public.gift_vouchers;
create policy gift_vouchers_service_all on public.gift_vouchers
  for all to service_role using (true) with check (true);

drop policy if exists voucher_redemptions_service_all on public.voucher_redemptions;
create policy voucher_redemptions_service_all on public.voucher_redemptions
  for all to service_role using (true) with check (true);

drop policy if exists loyalty_rules_service_all on public.loyalty_rules;
create policy loyalty_rules_service_all on public.loyalty_rules
  for all to service_role using (true) with check (true);

-- Generic loyalty point credit helper used by referral, review, social share and birthday flows.
create or replace function public.credit_loyalty_points(
  p_user_id uuid,
  p_event_type text,
  p_source_key text,
  p_reason text,
  p_order_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_points bigint;
  v_rule_active boolean;
  v_inserted integer;
begin
  if p_user_id is null then
    raise exception 'User id is required';
  end if;

  select points, is_active into v_points, v_rule_active
  from public.loyalty_rules
  where event_type = p_event_type;

  if v_points is null or v_rule_active = false then
    return;
  end if;

  insert into public.reward_accounts (user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;

  insert into public.reward_ledger (
    user_id, order_id, entry_type, points, status, reason,
    source_key, available_at, metadata
  ) values (
    p_user_id, p_order_id, 'earn', v_points, 'available', p_reason,
    p_source_key, now(), p_metadata
  ) on conflict (source_key) do nothing;
  get diagnostics v_inserted = row_count;

  if v_inserted = 1 then
    update public.reward_accounts
    set available_points = available_points + v_points,
        lifetime_points = lifetime_points + v_points,
        updated_at = now()
    where user_id = p_user_id;
  end if;
end;
$function$;

revoke all on function public.credit_loyalty_points(uuid, text, text, text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.credit_loyalty_points(uuid, text, text, text, uuid, jsonb) to service_role;
