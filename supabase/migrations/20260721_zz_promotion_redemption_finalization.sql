-- Record promotion usage only after payment succeeds. This function is
-- idempotent so Paystack verification and webhook retries cannot double-count.
create or replace function public.record_order_promotion_redemptions(p_order_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_customer_user_id uuid;
  v_applied record;
  v_redemption_id uuid;
  v_code_id uuid;
  v_recorded integer := 0;
begin
  select customer_user_id
  into v_customer_user_id
  from public.orders
  where id = p_order_id;

  if not found then
    raise exception 'Order not found';
  end if;

  for v_applied in
    select promotion_id, discount_amount, promotion_snapshot
    from public.applied_promotions
    where order_id = p_order_id
      and promotion_id is not null
    order by created_at, id
  loop
    v_code_id := nullif(v_applied.promotion_snapshot ->> 'promotion_code_id', '')::uuid;
    v_redemption_id := null;

    insert into public.promotion_redemptions (
      promotion_id,
      promotion_code_id,
      order_id,
      user_id,
      discount_amount
    )
    values (
      v_applied.promotion_id,
      v_code_id,
      p_order_id,
      v_customer_user_id,
      v_applied.discount_amount
    )
    on conflict (promotion_id, order_id) do nothing
    returning id into v_redemption_id;

    if v_redemption_id is not null then
      v_recorded := v_recorded + 1;
      if v_code_id is not null then
        update public.promotion_codes
        set usage_count = usage_count + 1
        where id = v_code_id;
      end if;
    end if;
  end loop;

  return v_recorded;
end;
$$;

revoke all on function public.record_order_promotion_redemptions(uuid) from public, anon, authenticated;
grant execute on function public.record_order_promotion_redemptions(uuid) to service_role;

