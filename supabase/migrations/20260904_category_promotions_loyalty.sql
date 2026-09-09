-- Category promotions + channel settings + loyalty engine.
--
-- 1. `promotion_categories` lets an admin target whole categories (free-text
--    `products.category`) instead of enumerating product UUIDs. Zero rows =
--    all categories, mirroring `promotion_products`.
-- 2. `promotions.available_online / available_at_counter` lets an admin say
--    where an offer runs. Existing rows stay online-only so the till changes
--    nothing until an admin opts in.
-- 3. `loyalty_rules` gains channel flags + `config` JSONB for the purchase
--    earn knobs (rate, minimum, category multipliers, expiry) without
--    touching the event_type CHECK.
-- 4. `loyalty_tiers` + `loyalty_redemption_policy` move hardcoded rewards.ts
--    constants into admin-editable rows.

-- ---------------------------------------------------------------- promotion categories
create table if not exists public.promotion_categories (
  promotion_id uuid not null references public.promotions(id) on delete cascade,
  category text not null,
  is_excluded boolean not null default false,
  primary key (promotion_id, category)
);

create index if not exists promotion_categories_promotion_idx
  on public.promotion_categories(promotion_id);

-- ---------------------------------------------------------------- promotion channels
alter table public.promotions
  add column if not exists available_online boolean not null default true,
  add column if not exists available_at_counter boolean not null default false;

-- Counter promos are automatic-only: a code promo flagged for the till would
-- be unreachable (POS has no code field), so keep the data honest.
-- (Enforced in the API/domain; no DB CHECK so legacy imports never fail.)

-- ---------------------------------------------------------------- loyalty rule channels + config
alter table public.loyalty_rules
  add column if not exists earn_online boolean not null default true,
  add column if not exists earn_at_counter boolean not null default false,
  add column if not exists config jsonb not null default '{}'::jsonb;

-- Referral/review/birthday/share stay online-only by default; purchase can be
-- enabled at the till per shop policy. Existing rows keep online earn on.
update public.loyalty_rules
  set earn_online = true,
      earn_at_counter = false
  where earn_online is null or earn_at_counter is null;

-- Seed a purchase config so the earn path has a rate to read: 1pt per GH₵1,
-- no minimum, no multipliers, 12-month expiry.
update public.loyalty_rules
  set config = coalesce(config, '{}'::jsonb) || '{"points_per_cedi": 1, "minimum_order_amount": 0, "category_multipliers": {}, "expiry_days": 365}'::jsonb
  where event_type = 'purchase'
    and coalesce((config->>'points_per_cedi'), '') = '';

-- ---------------------------------------------------------------- loyalty tiers
create table if not exists public.loyalty_tiers (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  min_lifetime_points bigint not null default 0 check (min_lifetime_points >= 0),
  earn_multiplier numeric(6,3) not null default 1 check (earn_multiplier > 0),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.loyalty_tiers (name, min_lifetime_points, earn_multiplier, sort_order)
values
  ('Bronze', 0, 1, 0),
  ('Silver', 5000, 1.25, 1),
  ('Gold', 20000, 1.5, 2)
on conflict (name) do nothing;

-- ---------------------------------------------------------------- redemption policy (singleton)
create table if not exists public.loyalty_redemption_policy (
  id integer primary key default 1 check (id = 1),
  points_per_cedi integer not null default 100 check (points_per_cedi > 0),
  min_redemption_points integer not null default 500 check (min_redemption_points > 0),
  max_share_of_order numeric(5,4) not null default 0.2 check (max_share_of_order > 0 and max_share_of_order <= 1),
  allow_online boolean not null default true,
  allow_at_counter boolean not null default false,
  updated_at timestamptz not null default now()
);

insert into public.loyalty_redemption_policy (id)
values (1)
on conflict (id) do nothing;

-- ---------------------------------------------------------------- RLS (mirror promotion_products: service full, admin all, no public)
alter table public.promotion_categories enable row level security;
alter table public.loyalty_tiers enable row level security;
alter table public.loyalty_redemption_policy enable row level security;

drop policy if exists promotion_categories_service_all on public.promotion_categories;
create policy promotion_categories_service_all on public.promotion_categories
  for all to service_role using (true) with check (true);

drop policy if exists promotion_categories_admin_all on public.promotion_categories;
create policy promotion_categories_admin_all on public.promotion_categories
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists loyalty_tiers_service_all on public.loyalty_tiers;
create policy loyalty_tiers_service_all on public.loyalty_tiers
  for all to service_role using (true) with check (true);

drop policy if exists loyalty_tiers_admin_all on public.loyalty_tiers;
create policy loyalty_tiers_admin_all on public.loyalty_tiers
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists loyalty_tiers_public_read on public.loyalty_tiers;
create policy loyalty_tiers_public_read on public.loyalty_tiers
  for select to authenticated using (is_active = true);

drop policy if exists loyalty_redemption_policy_service_all on public.loyalty_redemption_policy;
create policy loyalty_redemption_policy_service_all on public.loyalty_redemption_policy
  for all to service_role using (true) with check (true);

drop policy if exists loyalty_redemption_policy_admin_all on public.loyalty_redemption_policy;
create policy loyalty_redemption_policy_admin_all on public.loyalty_redemption_policy
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists loyalty_redemption_policy_public_read on public.loyalty_redemption_policy;
create policy loyalty_redemption_policy_public_read on public.loyalty_redemption_policy
  for select to authenticated using (true);

-- ---------------------------------------------------------------- reward_ledger expiry index
create index if not exists reward_ledger_expires_idx
  on public.reward_ledger(expires_at)
  where status = 'available' and expires_at is not null;

-- ---------------------------------------------------------------- purchase earn respects admin rules
--
-- Replaces the hardcoded `floor(total - delivery)` 1pt/₵1 earn with the
-- purchase rule's config: channel flag, rate, minimum, tier multiplier and
-- expiry. Guests earn nothing; inactive rules earn nothing; idempotent on
-- `order:{id}:purchase` so verify/webhook retries converge.
create or replace function public.finalize_checkout_reservation(
  p_reservation_id uuid,
  p_order_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_payment_status text;
  v_customer_user_id uuid;
  v_merchandise numeric;
  v_rule record;
  v_rate numeric;
  v_minimum numeric;
  v_multiplier numeric := 1;
  v_lifetime bigint := 0;
  v_reward_points bigint;
  v_reward_inserted integer;
  v_expiry_days integer;
begin
  select payment_status, customer_user_id into v_payment_status, v_customer_user_id
  from public.orders
  where id = p_order_id
  for update;
  if v_payment_status is null then raise exception 'Order not found'; end if;
  if v_payment_status = 'paid' then return; end if;

  perform 1 from public.inventory_reservations
  where id = p_reservation_id and order_id = p_order_id
  for update;
  if not found then raise exception 'Reservation does not belong to order'; end if;

  perform private.confirm_reservation(p_reservation_id);

  with affected_products as (
    select distinct allocation.shop_id, variant.product_id
    from public.fulfilment_allocations allocation
    join public.fulfilment_allocation_items allocation_item
      on allocation_item.allocation_id = allocation.id
    join public.product_variants variant on variant.id = allocation_item.variant_id
    where allocation.order_id = p_order_id
  ), normalized_totals as (
    select affected.shop_id, affected.product_id,
      coalesce(sum(level.on_hand), 0)::integer as on_hand
    from affected_products affected
    join public.product_variants variant on variant.product_id = affected.product_id
    left join public.inventory_levels level
      on level.variant_id = variant.id and level.shop_id = affected.shop_id
    group by affected.shop_id, affected.product_id
  )
  update public.product_shop_availability legacy
  set stock_quantity = totals.on_hand,
      is_available = totals.on_hand > 0
  from normalized_totals totals
  where legacy.product_id = totals.product_id
    and legacy.shop_id = totals.shop_id;

  update public.orders
  set payment_status = 'paid', order_status = 'received',
      payment_date = now(), updated_at = now()
  where id = p_order_id;

  if v_customer_user_id is null then return; end if;

  select * into v_rule from public.loyalty_rules where event_type = 'purchase';
  if not found then return; end if;
  if coalesce(v_rule.is_active, true) = false then return; end if;
  if coalesce(v_rule.earn_online, true) = false then return; end if;

  v_rate := coalesce(nullif(v_rule.config->>'points_per_cedi', '')::numeric, 1);
  if v_rate <= 0 then v_rate := 1; end if;
  v_minimum := coalesce(nullif(v_rule.config->>'minimum_order_amount', '')::numeric, 0);
  v_expiry_days := nullif(v_rule.config->>'expiry_days', '')::integer;

  select greatest(
    orders.total_amount - coalesce(sum(allocations.delivery_fee), 0),
    0
  )
  into v_merchandise
  from public.orders orders
  left join public.fulfilment_allocations allocations on allocations.order_id = orders.id
  where orders.id = p_order_id
  group by orders.total_amount;

  if coalesce(v_merchandise, 0) < coalesce(v_minimum, 0) then return; end if;

  select coalesce(lifetime_points, 0) into v_lifetime
  from public.reward_accounts where user_id = v_customer_user_id;
  select coalesce(max(earn_multiplier), 1) into v_multiplier
  from public.loyalty_tiers
  where is_active = true and min_lifetime_points <= coalesce(v_lifetime, 0);
  if v_multiplier is null or v_multiplier <= 0 then v_multiplier := 1; end if;

  v_reward_points := floor(coalesce(v_merchandise, 0) * v_rate * v_multiplier)::bigint;

  if coalesce(v_reward_points, 0) > 0 then
    insert into public.reward_accounts (user_id)
    values (v_customer_user_id)
    on conflict (user_id) do nothing;

    insert into public.reward_ledger (
      user_id, order_id, entry_type, points, status, reason,
      source_key, available_at, expires_at, metadata
    ) values (
      v_customer_user_id, p_order_id, 'earn', v_reward_points, 'available',
      'Purchase reward', 'order:' || p_order_id::text || ':purchase', now(),
      case when v_expiry_days is not null and v_expiry_days > 0
        then now() + (v_expiry_days || ' days')::interval end,
      jsonb_build_object('rate', v_rate, 'multiplier', v_multiplier, 'delivery_excluded', true, 'channel', 'online')
    ) on conflict (source_key) do nothing;
    get diagnostics v_reward_inserted = row_count;

    if v_reward_inserted = 1 then
      update public.reward_accounts
      set available_points = available_points + v_reward_points,
          lifetime_points = lifetime_points + v_reward_points,
          updated_at = now()
      where user_id = v_customer_user_id;
    end if;
  end if;
end;
$function$;

revoke all on function public.finalize_checkout_reservation(uuid, uuid) from public, anon, authenticated;
grant execute on function public.finalize_checkout_reservation(uuid, uuid) to service_role;
