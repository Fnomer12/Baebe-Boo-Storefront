-- Counter (POS) sale integrity checks.
--
-- Run against a clone of the real schema after every migration has been
-- applied. The whole file is one transaction that always rolls back, so it
-- seeds its own product/variant/staff rows and leaves nothing behind.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/counter_sale.sql
begin;

do $test$
declare
  v_shop_id uuid;
  v_product_id uuid;
  v_variant_id uuid;
  v_staff_id uuid;
  v_other_staff_id uuid;
  v_email text := 'counter-integrity-test@counter.baebe-boo.local';
  v_first_order_id uuid;
  v_first_order_number text;
  v_replay_order_id uuid;
  v_replay_order_number text;
  v_order_count integer;
  v_on_hand integer;
  v_legacy_stock integer;
  v_legacy_available boolean;
  v_item record;
  v_order record;
  v_raised boolean;
begin
  ------------------------------------------------------------------------
  -- Seed
  ------------------------------------------------------------------------
  select id into v_shop_id
  from public.shops
  where is_active
  order by created_at
  limit 1;
  if v_shop_id is null then
    raise exception 'counter tests need at least one active shop';
  end if;

  insert into public.products (
    name, description, category, age_range, gender, sku, price, image_url, is_active
  )
  values ('Counter Integrity Test', 'seeded by counter_sale.sql', 'Others',
          '0-3 months', 'unisex', 'BB-TEST-COUNTER-001', 25.00, '', true)
  returning id into v_product_id;

  insert into public.product_variants (product_id, sku, title, price, cost_price, is_default, is_active)
  values (v_product_id, 'BB-TEST-COUNTER-001-01', 'Default', 25.00, 10.00, true, true)
  returning id into v_variant_id;

  insert into public.inventory_levels (variant_id, shop_id, on_hand, reserved, reorder_point)
  values (v_variant_id, v_shop_id, 10, 0, 0);

  insert into public.product_shop_availability (product_id, shop_id, stock_quantity, is_available)
  values (v_product_id, v_shop_id, 10, true);

  insert into public.shop_staff (shop_id, staff_name, staff_code)
  values (v_shop_id, 'Counter Integrity Test', 'BBTEST01')
  returning id into v_staff_id;

  insert into public.staff_authorizations (email, staff_id, active)
  values (v_email, v_staff_id, true);

  -- A second staff member used only to prove p_staff_id cannot be spoofed.
  insert into public.shop_staff (shop_id, staff_name, staff_code)
  values (v_shop_id, 'Counter Integrity Other', 'BBTEST02')
  returning id into v_other_staff_id;

  -- Act as the counter cashier, not as service_role, so the JWT-derived
  -- authorization branch is the one under test.
  perform set_config(
    'request.jwt.claims',
    json_build_object('role', 'authenticated', 'email', v_email)::text,
    true
  );

  ------------------------------------------------------------------------
  -- 1. A sale attributes the cashier, prices the line and moves both stock
  --    tables.
  ------------------------------------------------------------------------
  select sale.order_id, sale.order_number
    into v_first_order_id, v_first_order_number
  from public.complete_counter_sale(
    v_staff_id,
    jsonb_build_array(jsonb_build_object('variant_id', v_variant_id, 'quantity', 2)),
    'cash',
    'Integrity Test Customer',
    '',
    'counter-integrity-test-key'
  ) sale;

  if v_first_order_id is null then
    raise exception 'complete_counter_sale returned no order';
  end if;

  select * into v_order from public.orders where id = v_first_order_id;
  if v_order.staff_id is distinct from v_staff_id then
    raise exception 'sale did not attribute the cashier (staff_id = %)', v_order.staff_id;
  end if;
  if v_order.shop_id is distinct from v_shop_id then
    raise exception 'sale was booked against the wrong shop';
  end if;
  if v_order.total_amount <> 50.00 then
    raise exception 'sale total should be 50.00, got %', v_order.total_amount;
  end if;
  if v_order.idempotency_key is distinct from 'counter:counter-integrity-test-key' then
    raise exception 'idempotency key was not namespaced and stored (got %)', v_order.idempotency_key;
  end if;

  select * into v_item from public.order_items where order_id = v_first_order_id;
  if v_item.variant_id is distinct from v_variant_id then
    raise exception 'order item lost its variant reference';
  end if;
  if coalesce(v_item.price, 0) <> 25.00 then
    raise exception 'order item price was not captured (got %)', v_item.price;
  end if;
  if coalesce(v_item.cost_price, 0) <> 10.00 then
    raise exception 'order item cost price was not captured (got %)', v_item.cost_price;
  end if;

  select on_hand into v_on_hand
  from public.inventory_levels
  where variant_id = v_variant_id and shop_id = v_shop_id;
  if v_on_hand <> 8 then
    raise exception 'inventory_levels.on_hand should be 8, got %', v_on_hand;
  end if;

  select stock_quantity, is_available into v_legacy_stock, v_legacy_available
  from public.product_shop_availability
  where product_id = v_product_id and shop_id = v_shop_id;
  if v_legacy_stock <> 8 then
    raise exception 'legacy product_shop_availability was not synchronized (got %)', v_legacy_stock;
  end if;
  if v_legacy_available is not true then
    raise exception 'legacy availability flag was cleared while stock remains';
  end if;

  ------------------------------------------------------------------------
  -- 2. Replaying the same idempotency key returns the original sale and
  --    does not decrement stock a second time.
  ------------------------------------------------------------------------
  select sale.order_id, sale.order_number
    into v_replay_order_id, v_replay_order_number
  from public.complete_counter_sale(
    v_staff_id,
    jsonb_build_array(jsonb_build_object('variant_id', v_variant_id, 'quantity', 2)),
    'cash',
    'Integrity Test Customer',
    '',
    'counter-integrity-test-key'
  ) sale;

  if v_replay_order_id is distinct from v_first_order_id
     or v_replay_order_number is distinct from v_first_order_number then
    raise exception 'replay returned a different sale (% vs %)', v_replay_order_id, v_first_order_id;
  end if;

  select count(*) into v_order_count
  from public.orders
  where idempotency_key = 'counter:counter-integrity-test-key';
  if v_order_count <> 1 then
    raise exception 'replay created % orders, expected 1', v_order_count;
  end if;

  select on_hand into v_on_hand
  from public.inventory_levels
  where variant_id = v_variant_id and shop_id = v_shop_id;
  if v_on_hand <> 8 then
    raise exception 'replay decremented stock again (on_hand = %)', v_on_hand;
  end if;

  ------------------------------------------------------------------------
  -- 3. A sale cannot be booked against another staff member.
  ------------------------------------------------------------------------
  v_raised := false;
  begin
    perform public.complete_counter_sale(
      v_other_staff_id,
      jsonb_build_array(jsonb_build_object('variant_id', v_variant_id, 'quantity', 1)),
      'cash',
      'Integrity Test Customer',
      '',
      'counter-integrity-test-key-2'
    );
  exception when others then
    v_raised := true;
  end;
  if not v_raised then
    raise exception 'a cashier was able to book a sale under another staff id';
  end if;

  ------------------------------------------------------------------------
  -- 4. An unauthorized session cannot sell at all.
  ------------------------------------------------------------------------
  perform set_config(
    'request.jwt.claims',
    json_build_object('role', 'authenticated', 'email', 'nobody@example.com')::text,
    true
  );
  v_raised := false;
  begin
    perform public.complete_counter_sale(
      v_staff_id,
      jsonb_build_array(jsonb_build_object('variant_id', v_variant_id, 'quantity', 1)),
      'cash',
      'Integrity Test Customer',
      '',
      'counter-integrity-test-key-3'
    );
  exception when others then
    v_raised := true;
  end;
  if not v_raised then
    raise exception 'an unauthorized session completed a counter sale';
  end if;

  ------------------------------------------------------------------------
  -- 5. Grants: the browser role may sell, anon may not.
  ------------------------------------------------------------------------
  if has_function_privilege(
    'anon',
    'public.complete_counter_sale(uuid,jsonb,text,text,text,text)',
    'execute'
  ) then
    raise exception 'anon can complete counter sales';
  end if;
  if not has_function_privilege(
    'authenticated',
    'public.complete_counter_sale(uuid,jsonb,text,text,text,text)',
    'execute'
  ) then
    raise exception 'counter staff cannot complete sales';
  end if;
  if has_function_privilege('anon', 'public.collect_counter_order(uuid)', 'execute') then
    raise exception 'anon can hand over collection orders';
  end if;

  ------------------------------------------------------------------------
  -- 6. Exactly one complete_counter_sale signature exists, so PostgREST can
  --    resolve the call without PGRST203.
  ------------------------------------------------------------------------
  select count(*) into v_order_count
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'complete_counter_sale';
  if v_order_count <> 1 then
    raise exception 'expected exactly one complete_counter_sale overload, found %', v_order_count;
  end if;

  raise notice 'counter sale integrity checks passed';
end
$test$;

rollback;
