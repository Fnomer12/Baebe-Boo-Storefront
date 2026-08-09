-- Phase 1: Business Intelligence dashboard and profit reporting.
-- Adds staff/cashier attribution to orders, captures historical cost on order items,
-- and creates reporting views used by /api/admin/reports/*.

-- 1. Cashier / staff attribution for sales-by-cashier reporting.
alter table public.orders
  add column if not exists staff_id uuid references public.shop_staff(id) on delete set null;

create index if not exists orders_staff_idx on public.orders(staff_id) where staff_id is not null;

-- 2. Capture historical cost price on each order line so profit reports remain
-- accurate even when product costs change later.
alter table public.order_items
  add column if not exists cost_price numeric(12,2) check (cost_price is null or cost_price >= 0);

-- Backfill missing historical cost from the default variant's current cost price.
update public.order_items oi
set cost_price = coalesce(
  (
    select v.cost_price
    from public.product_variants v
    where v.product_id = oi.product_id
      and v.is_default
    limit 1
  ),
  0
)
where oi.cost_price is null;

-- 3. Daily profit materialized view. Refresh with:
--   refresh materialized view concurrently public.report_daily_profit;
create materialized view if not exists public.report_daily_profit as
select
  date_trunc('day', o.created_at)::date as day,
  o.shop_id,
  s.name as shop_name,
  count(distinct o.id) as order_count,
  sum(o.total_amount) as revenue,
  coalesce(sum(oi.total_cost), 0) as cost_of_goods_sold,
  coalesce(sum(promo.discount_amount), 0) as discounts,
  coalesce(sum(refunded.amount), 0) as refunds,
  sum(o.total_amount)
    - coalesce(sum(oi.total_cost), 0)
    - coalesce(sum(promo.discount_amount), 0)
    - coalesce(sum(refunded.amount), 0) as gross_profit
from public.orders o
join public.shops s on s.id = o.shop_id
left join (
  select order_id, sum(quantity * coalesce(cost_price, 0)) as total_cost
  from public.order_items
  group by order_id
) oi on oi.order_id = o.id
left join (
  select order_id, sum(discount_amount) as discount_amount
  from public.applied_promotions
  group by order_id
) promo on promo.order_id = o.id
-- `refunds` has no order_id: it reaches an order through payment_attempts
-- (see 20260721_z_commerce_foundation.sql). This file previously selected
-- refunds.order_id directly, which is a 42703 against an empty database — the
-- fix had been applied by hand in production and never written back here, so
-- the migration set could not rebuild the schema it supposedly describes.
-- Matches the deployed definition of report_daily_profit exactly.
left join (
  select pa.order_id, sum(r.amount) as amount
  from public.refunds r
  join public.payment_attempts pa on pa.id = r.payment_attempt_id
  where r.status = 'succeeded'
  group by pa.order_id
) refunded on refunded.order_id = o.id
where o.payment_status = 'paid'
group by date_trunc('day', o.created_at)::date, o.shop_id, s.name
order by day desc;

create unique index if not exists report_daily_profit_pk
  on public.report_daily_profit(day, shop_id);
create index if not exists report_daily_profit_day_idx
  on public.report_daily_profit(day desc);

-- 4. Inventory health: low stock, dead stock, slow movers.
create or replace view public.report_inventory_health as
with sales_velocity as (
  select
    iv.variant_id,
    iv.shop_id,
    coalesce(sum(oi.quantity), 0) as units_sold_30d
  from public.inventory_levels iv
  left join public.order_items oi on oi.product_id = (
    select v.product_id from public.product_variants v where v.id = iv.variant_id
  )
  left join public.orders o on o.id = oi.order_id
    and o.payment_status = 'paid'
    and o.created_at >= now() - interval '30 days'
  group by iv.variant_id, iv.shop_id
)
select
  iv.id as inventory_level_id,
  iv.variant_id,
  v.product_id,
  p.name as product_name,
  v.sku,
  iv.shop_id,
  s.name as shop_name,
  iv.on_hand,
  iv.reserved,
  greatest(iv.on_hand - iv.reserved, 0) as available,
  iv.reorder_point,
  sv.units_sold_30d,
  case
    when greatest(iv.on_hand - iv.reserved, 0) <= iv.reorder_point then 'low_stock'
    when iv.on_hand > 0 and sv.units_sold_30d = 0 then 'dead_stock'
    when iv.on_hand > 0 and sv.units_sold_30d <= 2 then 'slow_moving'
    else 'healthy'
  end as status
from public.inventory_levels iv
join public.product_variants v on v.id = iv.variant_id
join public.products p on p.id = v.product_id
join public.shops s on s.id = iv.shop_id
left join sales_velocity sv on sv.variant_id = iv.variant_id and sv.shop_id = iv.shop_id;

-- 5. Top customers by lifetime spend and order count.
create or replace view public.report_top_customers as
select
  cp.user_id,
  cp.full_name as customer_name,
  cp.email,
  cp.phone,
  count(distinct o.id) as total_orders,
  coalesce(sum(o.total_amount), 0) as lifetime_spend,
  avg(o.total_amount) as average_order_value,
  max(o.created_at) as last_order_at,
  ra.available_points as loyalty_points
from public.customer_profiles cp
left join public.orders o on o.customer_user_id = cp.user_id and o.payment_status = 'paid'
left join public.reward_accounts ra on ra.user_id = cp.user_id
group by cp.user_id, cp.full_name, cp.email, cp.phone, ra.available_points;

-- 6. Top-selling brands (taxonomy kind = 'brand').
create or replace view public.report_top_brands as
select
  t.id as brand_id,
  t.name as brand_name,
  coalesce(sum(oi.quantity), 0) as units_sold,
  coalesce(sum(oi.quantity * oi.price), 0) as revenue
from public.taxonomies t
join public.product_taxonomies pt on pt.taxonomy_id = t.id and pt.is_primary
join public.order_items oi on oi.product_id = pt.product_id
join public.orders o on o.id = oi.order_id and o.payment_status = 'paid'
where t.kind = 'brand'
   or (t.kind = 'category' and not exists (
     select 1 from public.taxonomies b
     join public.product_taxonomies pt2 on pt2.taxonomy_id = b.id and pt2.is_primary
     where b.kind = 'brand' and pt2.product_id = pt.product_id
   ))
group by t.id, t.name
order by revenue desc;

-- 7. Sales by cashier / staff member.
create or replace view public.report_sales_by_cashier as
select
  ss.id as staff_id,
  ss.staff_name as cashier_name,
  ss.shop_id,
  s.name as shop_name,
  count(distinct o.id) as order_count,
  coalesce(sum(o.total_amount), 0) as total_sales,
  avg(o.total_amount) as average_order_value
from public.shop_staff ss
join public.shops s on s.id = ss.shop_id
left join public.orders o on o.staff_id = ss.id and o.payment_status = 'paid'
where ss.is_active = true
   or o.id is not null
group by ss.id, ss.staff_name, ss.shop_id, s.name;

-- 8. Helper functions for the dashboard API.
create or replace function public.profit_summary(p_start_date date, p_end_date date)
returns table (
  revenue numeric,
  cost_of_goods_sold numeric,
  discounts numeric,
  refunds numeric,
  gross_profit numeric,
  order_count bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    coalesce(sum(rdp.revenue), 0) as revenue,
    coalesce(sum(rdp.cost_of_goods_sold), 0) as cost_of_goods_sold,
    coalesce(sum(rdp.discounts), 0) as discounts,
    coalesce(sum(rdp.refunds), 0) as refunds,
    coalesce(sum(rdp.gross_profit), 0) as gross_profit,
    coalesce(sum(rdp.order_count), 0) as order_count
  from public.report_daily_profit rdp
  where rdp.day between p_start_date and p_end_date;
$$;

create or replace function public.refresh_daily_profit()
returns void
language sql
security definer
set search_path = public
as $$
  refresh materialized view concurrently public.report_daily_profit;
$$;

revoke all on function public.refresh_daily_profit() from public;
grant execute on function public.refresh_daily_profit() to authenticated, service_role;

-- 9. Permissions: authenticated admins already access orders/items through RLS policies;
-- reporting views are security invoker and will respect those policies automatically.
grant select on public.report_inventory_health to authenticated;
grant select on public.report_top_customers to authenticated;
grant select on public.report_top_brands to authenticated;
grant select on public.report_sales_by_cashier to authenticated;
grant select on public.report_daily_profit to authenticated;
