-- Make counter sales actually complete.
--
-- WHY THIS EXISTS
-- ---------------
-- `public.order_items` is a legacy table carrying BOTH generations of price
-- column:
--
--     unit_price   numeric NOT NULL   -- legacy, no default
--     total_price  numeric NOT NULL   -- legacy, no default
--     price        numeric            -- newer, for BI/profit reporting
--     cost_price   numeric            -- newer, for BI/profit reporting
--
-- `complete_counter_sale` inserts only `price` and `cost_price`. Postgres
-- therefore rejects every row on `unit_price`, the whole function rolls back,
-- and the till answers 409:
--
--   null value in column "unit_price" of relation "order_items"
--   violates not-null constraint
--
-- That is not an edge case. It means NO counter sale has ever succeeded — not
-- for any cashier, product, or payment method. It is the real content of the
-- report that "BaebeCounter is very poor".
--
-- This exact bug was already found and fixed on the ONLINE path. See the
-- comment in src/app/api/paystack/initialize/route.ts:
--
--   "`unit_price` and `total_price` are NOT NULL with no default on the legacy
--    order_items table. Omitting them made every single online order fail
--    here: the order row was created, this insert threw, and the catch below
--    marked the order payment_failed. Production has zero order_items rows as
--    a result."
--
-- The counter RPC has the identical defect and was never fixed, in either the
-- original definition (20260721_z_commerce_foundation.sql) or the hardened one
-- (20260728_counter_sale_integrity.sql).
--
-- WHAT THIS CHANGES
-- -----------------
-- One statement inside the function: the `insert into public.order_items`
-- now supplies `unit_price` and `total_price` alongside `price` and
-- `cost_price`. Everything else — the authorization block, the idempotency
-- key, the inventory decrement, the availability roll-up, the audit row — is
-- reproduced verbatim from 20260728_counter_sale_integrity.sql.
--
-- `unit_price` is the per-unit price and `total_price` is unit × quantity,
-- matching how the online path fills them, so a receipt reads the same
-- whichever door the sale came through.
--
-- Safe to run more than once.

do $do$
declare
  v_body text;
begin
  -- Rewrite the function in place rather than restating 200 lines of logic
  -- that has already been reviewed once. Fetching the current body and
  -- patching the single broken statement keeps this migration honest about
  -- its own scope: if the surrounding logic has moved on, this fails loudly
  -- instead of silently reverting it.
  select pg_get_functiondef(p.oid)
  into v_body
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'complete_counter_sale'
  limit 1;

  if v_body is null then
    raise exception
      'complete_counter_sale not found. Apply 20260728_counter_sale_integrity.sql first.';
  end if;

  if position('unit_price' in v_body) > 0 then
    raise notice 'complete_counter_sale already sets unit_price; nothing to do.';
    return;
  end if;

  if position(
       'order_id, product_id, variant_id, product_name, quantity, price, cost_price'
       in v_body) = 0 then
    raise exception
      'complete_counter_sale does not contain the expected order_items insert. '
      'Reconcile by hand rather than letting this migration guess.';
  end if;

  v_body := replace(
    v_body,
    'order_id, product_id, variant_id, product_name, quantity, price, cost_price',
    'order_id, product_id, variant_id, product_name, quantity, unit_price, total_price, price, cost_price'
  );

  v_body := replace(
    v_body,
    'select v_order_id, variant.product_id, variant.id, product.name, item.quantity,
    variant.price, coalesce(variant.cost_price, 0)',
    'select v_order_id, variant.product_id, variant.id, product.name, item.quantity,
    variant.price, round(variant.price * item.quantity, 2),
    variant.price, coalesce(variant.cost_price, 0)'
  );

  if position('round(variant.price * item.quantity, 2)' in v_body) = 0 then
    raise exception
      'Could not patch the order_items SELECT list in complete_counter_sale. '
      'Its formatting has changed; reconcile by hand.';
  end if;

  execute v_body;
end
$do$;

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- Verify: ring up a sale at the till, then
--
--   select oi.product_name, oi.quantity, oi.unit_price, oi.total_price, oi.price
--   from public.order_items oi
--   join public.orders o on o.id = oi.order_id
--   where o.order_type = 'instore'
--   order by oi.created_at desc limit 5;
--
-- unit_price must equal price, and total_price must equal unit_price × quantity.
-- ---------------------------------------------------------------------------
