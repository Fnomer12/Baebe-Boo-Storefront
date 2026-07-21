-- Run after both migrations on an isolated database. The transaction is read-only
-- with respect to business rows and fails fast on a security regression.
begin;

do $test$
declare
  v_table text;
begin
  foreach v_table in array array[
    'taxonomies', 'product_variants', 'product_media', 'inventory_levels',
    'inventory_reservations', 'fulfilment_allocations', 'shipments',
    'customer_profiles', 'customer_addresses', 'customer_consents', 'wishlists',
    'product_reviews', 'reward_accounts', 'reward_ledger', 'referrals',
    'gift_registries', 'content_posts', 'promotions', 'payment_attempts',
    'return_requests', 'refunds', 'commerce_events', 'audit_logs'
  ] loop
    if not coalesce((select relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = v_table), false) then
      raise exception 'RLS is not enabled on public.%', v_table;
    end if;
  end loop;

  if has_table_privilege('anon', 'public.inventory_levels', 'select') then
    raise exception 'anon can read exact inventory levels';
  end if;
  if has_column_privilege('anon', 'public.product_variants', 'cost_price', 'select') then
    raise exception 'anon can read variant cost prices';
  end if;
  if has_column_privilege('authenticated', 'public.product_reviews', 'user_id', 'select') then
    raise exception 'customers can read review owner identifiers';
  end if;
  if has_function_privilege('anon', 'public.reserve_checkout(jsonb,uuid,uuid,text,timestamp with time zone)', 'execute') then
    raise exception 'anon can reserve inventory';
  end if;
  if has_function_privilege('authenticated', 'public.finalize_checkout_reservation(uuid,uuid)', 'execute') then
    raise exception 'browser users can finalize reservations';
  end if;
  if not has_function_privilege('service_role', 'public.join_family(text,text,text,text,text,date,text,text)', 'execute') then
    raise exception 'service role cannot enroll family members';
  end if;
end
$test$;

rollback;
