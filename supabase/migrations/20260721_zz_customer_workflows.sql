-- Authenticated customer mutations that require transactional ownership checks.
-- The public wrappers are exposed to PostgREST but callable only by authenticated
-- sessions. Every function derives the subject from auth.uid().

create or replace function public.save_my_address(
  p_label text,
  p_recipient_name text,
  p_phone text,
  p_address_line_1 text,
  p_address_line_2 text,
  p_city text,
  p_region text,
  p_digital_address text,
  p_delivery_instructions text,
  p_is_default boolean,
  p_address_id uuid
)
returns uuid
language plpgsql
security invoker
set search_path = pg_catalog, public
as $function$
declare
  v_user_id uuid := auth.uid();
  v_address_id uuid;
  v_make_default boolean;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text, 0));
  v_make_default := coalesce(p_is_default, false) or not exists (
    select 1 from public.customer_addresses where user_id = v_user_id
  );

  if v_make_default then
    update public.customer_addresses
      set is_default = false
      where user_id = v_user_id and is_default;
  end if;

  if p_address_id is null then
    insert into public.customer_addresses (
      user_id, label, recipient_name, phone, address_line_1, address_line_2,
      city, region, digital_address, delivery_instructions, is_default
    ) values (
      v_user_id, nullif(p_label, ''), p_recipient_name, p_phone,
      p_address_line_1, nullif(p_address_line_2, ''), p_city, p_region,
      nullif(upper(p_digital_address), ''), nullif(p_delivery_instructions, ''),
      v_make_default
    ) returning id into v_address_id;
  else
    update public.customer_addresses set
      label = nullif(p_label, ''),
      recipient_name = p_recipient_name,
      phone = p_phone,
      address_line_1 = p_address_line_1,
      address_line_2 = nullif(p_address_line_2, ''),
      city = p_city,
      region = p_region,
      digital_address = nullif(upper(p_digital_address), ''),
      delivery_instructions = nullif(p_delivery_instructions, ''),
      is_default = case when v_make_default then true else is_default end
    where id = p_address_id and user_id = v_user_id
    returning id into v_address_id;

    if v_address_id is null then
      raise exception 'Address not found';
    end if;
  end if;

  return v_address_id;
end;
$function$;

revoke all on function public.save_my_address(text,text,text,text,text,text,text,text,text,boolean,uuid) from public, anon;
grant execute on function public.save_my_address(text,text,text,text,text,text,text,text,text,boolean,uuid) to authenticated;

create or replace function public.delete_my_address(p_address_id uuid)
returns void
language plpgsql
security invoker
set search_path = pg_catalog, public
as $function$
declare
  v_user_id uuid := auth.uid();
  v_was_default boolean;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text, 0));
  delete from public.customer_addresses
    where id = p_address_id and user_id = v_user_id
    returning is_default into v_was_default;

  if v_was_default is null then
    raise exception 'Address not found';
  end if;

  if v_was_default then
    update public.customer_addresses
      set is_default = true
      where id = (
        select id from public.customer_addresses
        where user_id = v_user_id
        order by updated_at desc, created_at desc
        limit 1
      );
  end if;
end;
$function$;

revoke all on function public.delete_my_address(uuid) from public, anon;
grant execute on function public.delete_my_address(uuid) to authenticated;

create or replace function public.request_my_return(
  p_order_id uuid,
  p_reason text,
  p_notes text,
  p_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_user_id uuid := auth.uid();
  v_return_id uuid;
  v_order_status text;
  v_payment_status text;
  v_item_count integer;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'At least one return item is required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_order_id::text, 0));

  select order_status, payment_status
    into v_order_status, v_payment_status
  from public.orders
  where id = p_order_id and customer_user_id = v_user_id;

  if not found then
    raise exception 'Order not found';
  end if;
  if v_payment_status <> 'paid' or v_order_status not in ('delivered', 'completed') then
    raise exception 'This order is not eligible for a return request';
  end if;

  with requested as (
    select (item ->> 'order_item_id')::uuid as order_item_id,
           (item ->> 'quantity')::integer as quantity
    from jsonb_array_elements(p_items) item
  )
  select count(*) into v_item_count from requested;

  if v_item_count > 20 or v_item_count <> (
    select count(distinct (item ->> 'order_item_id')::uuid)
    from jsonb_array_elements(p_items) item
  ) then
    raise exception 'Invalid return items';
  end if;

  if exists (
    with requested as (
      select (item ->> 'order_item_id')::uuid as order_item_id,
             (item ->> 'quantity')::integer as quantity
      from jsonb_array_elements(p_items) item
    ), previous as (
      select ri.order_item_id, coalesce(sum(ri.quantity), 0)::integer as quantity
      from public.return_items ri
      join public.return_requests rr on rr.id = ri.return_id
      where rr.order_id = p_order_id and rr.status not in ('rejected', 'cancelled')
      group by ri.order_item_id
    )
    select 1
    from requested r
    left join public.order_items oi
      on oi.id = r.order_item_id and oi.order_id = p_order_id
    left join previous p on p.order_item_id = r.order_item_id
    where oi.id is null
      or r.quantity < 1
      or r.quantity + coalesce(p.quantity, 0) > oi.quantity
  ) then
    raise exception 'A return quantity exceeds the purchased quantity';
  end if;

  insert into public.return_requests (order_id, user_id, reason, notes, status)
  values (p_order_id, v_user_id, p_reason, nullif(p_notes, ''), 'requested')
  returning id into v_return_id;

  insert into public.return_items (return_id, order_item_id, quantity)
  select v_return_id,
         (item ->> 'order_item_id')::uuid,
         (item ->> 'quantity')::integer
  from jsonb_array_elements(p_items) item;

  return v_return_id;
end;
$function$;

revoke all on function public.request_my_return(uuid,text,text,jsonb) from public, anon;
grant execute on function public.request_my_return(uuid,text,text,jsonb) to authenticated;

create or replace function public.submit_verified_review(
  p_order_id uuid,
  p_product_id uuid,
  p_rating smallint,
  p_title text,
  p_body text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_user_id uuid := auth.uid();
  v_review_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;
  if p_rating < 1 or p_rating > 5 then
    raise exception 'Rating must be between 1 and 5';
  end if;

  if not exists (
    select 1
    from public.orders o
    join public.order_items oi on oi.order_id = o.id
    where o.id = p_order_id
      and o.customer_user_id = v_user_id
      and o.payment_status = 'paid'
      and o.order_status in ('delivered', 'completed')
      and oi.product_id = p_product_id
  ) then
    raise exception 'A delivered purchase is required to review this product';
  end if;

  insert into public.product_reviews (
    product_id, user_id, order_id, rating, title, body,
    status, is_verified_purchase, published_at
  ) values (
    p_product_id, v_user_id, p_order_id, p_rating, nullif(p_title, ''), p_body,
    'pending', true, null
  ) returning id into v_review_id;

  return v_review_id;
end;
$function$;

revoke all on function public.submit_verified_review(uuid,uuid,smallint,text,text) from public, anon;
grant execute on function public.submit_verified_review(uuid,uuid,smallint,text,text) to authenticated;
