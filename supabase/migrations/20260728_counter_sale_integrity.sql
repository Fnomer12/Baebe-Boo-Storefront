-- Counter (in-store POS) sale integrity.
--
-- Fixes four defects in `complete_counter_sale` and adds an explicit
-- click-and-collect handover path for the counter Orders workspace:
--
--   1. Cashier attribution      - `orders.staff_id` was never written, so
--                                 `report_sales_by_cashier` reported nothing.
--   2. Idempotency              - a retried POST rang up a second sale and
--                                 decremented stock twice.
--   3. Legacy stock sync        - only `inventory_levels` was decremented, so
--                                 the stock the storefront and counter read
--                                 (`product_shop_availability`) never moved.
--   4. BI columns on order_items - `variant_id` / `price` / `cost_price` were
--                                 omitted, so `report_daily_profit` showed a
--                                 100% margin and `report_top_brands` showed
--                                 zero revenue for every in-store sale.
--
-- Apply after 20260727_admin_bi_and_profit.sql (which adds `orders.staff_id`
-- and `order_items.cost_price`).

-- ---------------------------------------------------------------------------
-- 1. Idempotency key storage.
-- ---------------------------------------------------------------------------
-- The key is claimed by the `orders` insert itself. A dedicated table would
-- need a deferrable FK, its own RLS, grants and pruning; `payment_attempts`
-- cannot be used because its `order_id` is not null and therefore cannot take
-- a claim *before* the order exists.
alter table public.orders
  add column if not exists idempotency_key text;

create unique index if not exists orders_idempotency_key_uidx
  on public.orders(idempotency_key)
  where idempotency_key is not null;

-- ---------------------------------------------------------------------------
-- 2. Replace complete_counter_sale.
-- ---------------------------------------------------------------------------
-- Adding a defaulted parameter creates an overload rather than replacing the
-- function, and PostgREST cannot resolve the ambiguity (PGRST203). Drop every
-- existing signature first; the loop keeps this migration re-runnable.
do $do$
declare
  v_signature text;
begin
  for v_signature in
    select pg_catalog.pg_get_function_identity_arguments(p.oid)
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'complete_counter_sale'
  loop
    execute format('drop function if exists public.complete_counter_sale(%s)', v_signature);
  end loop;
end
$do$;

create function public.complete_counter_sale(
  p_staff_id uuid,
  p_items jsonb,
  p_payment_method text,
  p_customer_name text default 'Walk-in Customer',
  p_customer_phone text default '',
  p_idempotency_key text default null
)
returns table (order_id uuid, order_number text)
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_shop_id uuid;
  v_staff_id uuid;
  v_order_id uuid;
  v_completed_order_id uuid;
  v_order_number text := 'BB-POS-' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS');
  v_total numeric(12,2) := 0;
  v_line_total numeric(12,2);
  v_item record;
  v_changed integer;
  v_key text;
  v_existing_id uuid;
  v_existing_number text;
begin
  if p_payment_method not in ('cash', 'visa', 'momo') then
    raise exception 'Unsupported payment method';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'At least one sale item is required';
  end if;

  -- Blank keys normalise to null so a caller that omits the field is never
  -- treated as a replay of another caller that also omitted it.
  v_key := nullif(btrim(coalesce(p_idempotency_key, '')), '');
  if v_key is not null then
    v_key := 'counter:' || v_key;
  end if;

  -- Authorization. The staff id is derived from the signed session rather than
  -- trusted from the argument; a mismatched p_staff_id is an error in its own
  -- right rather than something to silently override. The service_role branch
  -- trusts p_staff_id because the route already resolved it server-side.
  if coalesce(auth.jwt() ->> 'role', '') = 'service_role' then
    select staff.id, staff.shop_id
      into v_staff_id, v_shop_id
    from public.shop_staff staff
    where staff.id = p_staff_id;
  else
    -- `staff_authorizations.email` is the primary key, so this yields at most
    -- one row. `authorization` is a reserved keyword and cannot alias a table.
    select staff.id, staff.shop_id
      into v_staff_id, v_shop_id
    from public.staff_authorizations staff_access
    join public.shop_staff staff on staff.id = staff_access.staff_id
    where staff_access.active
      and lower(staff_access.email) = lower(auth.jwt() ->> 'email');

    if v_staff_id is not null and p_staff_id is not null and v_staff_id <> p_staff_id then
      raise exception 'Counter session does not match the requested staff member';
    end if;
  end if;
  if v_shop_id is null then
    raise exception 'Counter is not authorized for a shop';
  end if;

  -- Fast path for a replay: avoids raising and re-catching in the common case.
  -- The unique index below remains the authoritative claim.
  if v_key is not null then
    select o.id, o.order_number
      into v_existing_id, v_existing_number
    from public.orders o
    where o.idempotency_key = v_key;
    if v_existing_id is not null then
      return query select v_existing_id, v_existing_number;
      return;
    end if;
  end if;

  -- Pass 1 - price and validate. Read-only on purpose: nothing may mutate
  -- before the idempotency key is claimed.
  for v_item in
    select
      (entry ->> 'variant_id')::uuid as variant_id,
      sum((entry ->> 'quantity')::integer)::integer as quantity
    from jsonb_array_elements(p_items) entry
    group by (entry ->> 'variant_id')::uuid
    order by (entry ->> 'variant_id')::uuid
  loop
    if v_item.variant_id is null then
      raise exception 'Every sale item needs a variant';
    end if;
    if v_item.quantity <= 0 then
      raise exception 'Sale quantities must be positive';
    end if;

    select variant.price * v_item.quantity into v_line_total
    from public.product_variants variant
    where variant.id = v_item.variant_id and variant.is_active;
    if not found then
      raise exception 'Unknown or inactive variant %', v_item.variant_id;
    end if;
    v_total := v_total + v_line_total;
  end loop;

  -- Claim the idempotency key. This must happen BEFORE any inventory write:
  -- with a late claim two concurrent duplicates both pass the availability
  -- guard, and the loser's rollback only unwinds its own subtransaction, so
  -- the second decrement would commit.
  begin
    insert into public.orders (
      order_number, customer_name, customer_phone, customer_email, delivery_address,
      shop_id, staff_id, total_amount, order_status, payment_method, payment_status,
      order_type, payment_date, idempotency_key
    ) values (
      v_order_number, trim(p_customer_name), trim(p_customer_phone), '', '',
      v_shop_id, v_staff_id, v_total, 'completed', p_payment_method, 'paid', 'instore',
      now(), v_key
    ) returning id into v_order_id;
  exception when unique_violation then
    -- Only an idempotency-key collision is a replay. Anything else (an
    -- order_number collision, say) must surface as the error it is.
    if v_key is null then
      raise;
    end if;
    select o.id, o.order_number
      into v_existing_id, v_existing_number
    from public.orders o
    where o.idempotency_key = v_key;
    if v_existing_id is null then
      raise;
    end if;
    return query select v_existing_id, v_existing_number;
    return;
  end;

  -- Pass 2 - decrement stock. Ordered by variant id so concurrent sales lock
  -- inventory rows in a consistent order and cannot deadlock each other.
  for v_item in
    select
      (entry ->> 'variant_id')::uuid as variant_id,
      sum((entry ->> 'quantity')::integer)::integer as quantity
    from jsonb_array_elements(p_items) entry
    group by (entry ->> 'variant_id')::uuid
    order by (entry ->> 'variant_id')::uuid
  loop
    update public.inventory_levels level
    set on_hand = level.on_hand - v_item.quantity,
        updated_at = now()
    where level.variant_id = v_item.variant_id
      and level.shop_id = v_shop_id
      and level.on_hand - level.reserved >= v_item.quantity;
    get diagnostics v_changed = row_count;
    if v_changed <> 1 then
      raise exception 'Insufficient inventory for variant %', v_item.variant_id;
    end if;
  end loop;

  -- `price` and `cost_price` are captured here, not read back from the variant
  -- later, so profit reporting stays correct when costs change.
  insert into public.order_items (
    order_id, product_id, variant_id, product_name, quantity, price, cost_price
  )
  select v_order_id, variant.product_id, variant.id, product.name, item.quantity,
    variant.price, coalesce(variant.cost_price, 0)
  from (
    select (entry ->> 'variant_id')::uuid variant_id, sum((entry ->> 'quantity')::integer)::integer quantity
    from jsonb_array_elements(p_items) entry group by (entry ->> 'variant_id')::uuid
  ) item
  join public.product_variants variant on variant.id = item.variant_id
  join public.products product on product.id = variant.product_id;

  -- Keep the legacy availability table synchronized while existing admin and
  -- counter screens are migrated to inventory_levels. Mirrors the CTE in
  -- finalize_checkout_reservation; like that one it only updates rows that
  -- already exist, which is deliberate parity with the checkout path.
  with affected_products as (
    select distinct variant.product_id
    from jsonb_array_elements(p_items) entry
    join public.product_variants variant
      on variant.id = (entry ->> 'variant_id')::uuid
  ), normalized_totals as (
    select affected.product_id,
      coalesce(sum(level.on_hand), 0)::integer as on_hand
    from affected_products affected
    join public.product_variants variant on variant.product_id = affected.product_id
    left join public.inventory_levels level
      on level.variant_id = variant.id and level.shop_id = v_shop_id
    group by affected.product_id
  )
  update public.product_shop_availability legacy
  set stock_quantity = totals.on_hand,
      is_available = totals.on_hand > 0
  from normalized_totals totals
  where legacy.product_id = totals.product_id
    and legacy.shop_id = v_shop_id;

  insert into public.completed_orders (
    original_order_id, order_number, customer_name, customer_code, order_type, total_amount, completed_at
  ) values (
    v_order_id, v_order_number, trim(p_customer_name), 'POS-' || right(v_order_number, 8),
    'instore', v_total, now()
  ) returning id into v_completed_order_id;

  insert into public.completed_order_items (
    completed_order_id, product_name, product_image_url, category, quantity, price
  )
  select v_completed_order_id, product.name, coalesce(product.image_url, ''),
    coalesce(product.category, 'Others'), item.quantity, variant.price
  from (
    select (entry ->> 'variant_id')::uuid variant_id, sum((entry ->> 'quantity')::integer)::integer quantity
    from jsonb_array_elements(p_items) entry group by (entry ->> 'variant_id')::uuid
  ) item
  join public.product_variants variant on variant.id = item.variant_id
  join public.products product on product.id = variant.product_id;

  insert into public.payment_attempts (
    order_id, provider, provider_reference, amount, currency, channel, status, verified_at
  ) values (
    v_order_id, 'counter', 'counter:' || v_order_id::text, v_total, 'GHS', p_payment_method, 'paid', now()
  );

  insert into public.audit_logs (actor_user_id, actor_role, action, table_name, record_id, new_values)
  values (auth.uid(), 'counter', 'complete_sale', 'orders', v_order_id::text,
    jsonb_build_object('shop_id', v_shop_id, 'staff_id', v_staff_id, 'total', v_total));

  return query select v_order_id, v_order_number;
end;
$function$;

revoke all on function public.complete_counter_sale(uuid, jsonb, text, text, text, text) from public, anon;
grant execute on function public.complete_counter_sale(uuid, jsonb, text, text, text, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Click-and-collect handover.
-- ---------------------------------------------------------------------------
-- `transition_order` can only reach 'delivered' from 'dispatched'/'shipped',
-- but an online pickup order waiting at the counter sits in 'received'. Rather
-- than widen that matrix for every caller or chain four generic transitions,
-- this is an explicit, audited pickup path scoped to the caller's own shop.
create or replace function public.collect_counter_order(p_order_id uuid)
returns table (order_id uuid, order_status text)
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_shop_id uuid;
  v_staff_id uuid;
  v_order public.orders%rowtype;
  v_completed_order_id uuid;
  v_now timestamptz := now();
  v_is_service_role boolean := coalesce(auth.jwt() ->> 'role', '') = 'service_role';
begin
  if not v_is_service_role then
    select staff.id, staff.shop_id
      into v_staff_id, v_shop_id
    from public.staff_authorizations staff_access
    join public.shop_staff staff on staff.id = staff_access.staff_id
    where staff_access.active
      and lower(staff_access.email) = lower(auth.jwt() ->> 'email');
    if v_shop_id is null then
      raise exception 'Counter is not authorized for a shop';
    end if;
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if v_order.id is null then
    raise exception 'Order not found';
  end if;
  if v_shop_id is not null and v_order.shop_id is distinct from v_shop_id then
    raise exception 'Order belongs to another shop';
  end if;

  -- Idempotent: handing over an already-collected order is a no-op, not an
  -- error, because the cashier may well tap twice.
  if v_order.order_status = 'completed' then
    return query select v_order.id, v_order.order_status;
    return;
  end if;

  if coalesce(v_order.payment_status, '') <> 'paid' then
    raise exception 'Order has not been paid for';
  end if;
  if v_order.order_status not in ('received', 'processing', 'on_hold') then
    raise exception 'Order cannot be collected from status %', v_order.order_status;
  end if;

  update public.orders
  set order_status = 'completed',
      shipping_status = 'delivered',
      delivered_at = coalesce(delivered_at, v_now),
      updated_at = v_now
  where id = p_order_id;

  update public.fulfilment_allocations allocation
  set status = 'completed', updated_at = v_now
  where allocation.order_id = p_order_id
    and allocation.fulfilment_type = 'pickup'
    and allocation.status not in ('completed', 'cancelled');

  select completed.id into v_completed_order_id
  from public.completed_orders completed
  where completed.original_order_id = p_order_id
  limit 1;

  if v_completed_order_id is null then
    insert into public.completed_orders (
      original_order_id, order_number, customer_name, customer_code,
      order_type, total_amount, completed_at
    ) values (
      p_order_id, v_order.order_number, v_order.customer_name,
      coalesce(to_jsonb(v_order) ->> 'customer_code', ''),
      v_order.order_type, v_order.total_amount, v_now
    ) returning id into v_completed_order_id;

    insert into public.completed_order_items (
      completed_order_id, product_name, product_image_url, category, quantity, price
    )
    select v_completed_order_id, coalesce(item.product_name, product.name),
      coalesce(product.image_url, ''), coalesce(product.category, 'Others'),
      item.quantity, coalesce(item.price, product.price)
    from public.order_items item
    join public.products product on product.id = item.product_id
    where item.order_id = p_order_id;
  end if;

  insert into public.audit_logs (actor_user_id, actor_role, action, table_name, record_id, old_values, new_values)
  values (auth.uid(), 'counter', 'collect_order', 'orders', p_order_id::text,
    jsonb_build_object('order_status', v_order.order_status),
    jsonb_build_object('order_status', 'completed', 'staff_id', v_staff_id, 'shop_id', v_shop_id));

  return query select p_order_id, 'completed'::text;
end;
$function$;

revoke all on function public.collect_counter_order(uuid) from public, anon;
grant execute on function public.collect_counter_order(uuid) to authenticated, service_role;

-- PostgREST caches the function signature list. After dropping and recreating
-- complete_counter_sale the first call can fail with PGRST202 until the cache
-- reloads; this makes that deterministic.
notify pgrst, 'reload schema';
