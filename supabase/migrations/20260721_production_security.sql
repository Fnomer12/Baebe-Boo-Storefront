-- Production security boundary for the public storefront.
-- Apply this migration in the Supabase SQL editor before accepting orders.

create table if not exists public.admin_users (
  email text primary key,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.staff_authorizations (
  email text primary key,
  staff_id uuid not null references public.shop_staff(id) on delete cascade,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.admin_users enable row level security;
alter table public.staff_authorizations enable row level security;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_users
    where lower(email) = lower(auth.jwt() ->> 'email')
      and active = true
  );
$$;

create or replace function public.is_authorized_counter(p_staff_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.staff_authorizations
    where lower(email) = lower(auth.jwt() ->> 'email')
      and staff_id = p_staff_id
      and active = true
  );
$$;

revoke all on public.admin_users from anon, authenticated;
revoke all on public.staff_authorizations from anon, authenticated;

alter table public.products enable row level security;
alter table public.shops enable row level security;
alter table public.product_shop_availability enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.members enable row level security;
alter table public.shop_staff enable row level security;
alter table public.completed_orders enable row level security;
alter table public.completed_order_items enable row level security;

drop policy if exists product_images_public_read on storage.objects;
drop policy if exists product_images_admin_insert on storage.objects;
drop policy if exists product_images_admin_update on storage.objects;
drop policy if exists product_images_admin_delete on storage.objects;
create policy product_images_public_read on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'product-images');
create policy product_images_admin_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'product-images' and public.is_admin());
create policy product_images_admin_update on storage.objects
  for update to authenticated
  using (bucket_id = 'product-images' and public.is_admin())
  with check (bucket_id = 'product-images' and public.is_admin());
create policy product_images_admin_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'product-images' and public.is_admin());

drop policy if exists staff_images_admin_all on storage.objects;
create policy staff_images_admin_all on storage.objects
  for all to authenticated
  using (bucket_id = 'staff-images' and public.is_admin())
  with check (bucket_id = 'staff-images' and public.is_admin());

drop policy if exists products_public_read on public.products;
drop policy if exists products_admin_all on public.products;
create policy products_public_read on public.products
  for select to anon, authenticated using (is_active = true or public.is_admin());
create policy products_admin_all on public.products
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists shops_public_read on public.shops;
drop policy if exists shops_admin_all on public.shops;
create policy shops_public_read on public.shops
  for select to anon, authenticated using (is_active = true or public.is_admin());
create policy shops_admin_all on public.shops
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists availability_public_read on public.product_shop_availability;
drop policy if exists availability_admin_all on public.product_shop_availability;
create policy availability_public_read on public.product_shop_availability
  for select to anon, authenticated using (is_available = true);
create policy availability_admin_all on public.product_shop_availability
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists orders_admin_all on public.orders;
create policy orders_admin_all on public.orders
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists order_items_admin_all on public.order_items;
create policy order_items_admin_all on public.order_items
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists members_admin_all on public.members;
create policy members_admin_all on public.members
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists staff_admin_all on public.shop_staff;
drop policy if exists staff_counter_read on public.shop_staff;
create policy staff_admin_all on public.shop_staff
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy staff_counter_read on public.shop_staff
  for select to authenticated using (public.is_authorized_counter(id));

drop policy if exists completed_orders_admin_all on public.completed_orders;
create policy completed_orders_admin_all on public.completed_orders
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists completed_order_items_admin_all on public.completed_order_items;
create policy completed_order_items_admin_all on public.completed_order_items
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create or replace function public.register_member(
  p_parent_name text,
  p_child_first_name text,
  p_child_last_name text,
  p_phone text,
  p_email text,
  p_child_date_of_birth date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if length(trim(p_parent_name)) = 0
    or length(trim(p_child_first_name)) = 0
    or length(trim(p_child_last_name)) = 0
    or length(trim(p_phone)) = 0
    or position('@' in p_email) < 2 then
    raise exception 'Invalid membership details';
  end if;

  insert into public.members (
    parent_name,
    child_first_name,
    child_last_name,
    phone,
    email,
    child_date_of_birth
  ) values (
    trim(p_parent_name),
    trim(p_child_first_name),
    trim(p_child_last_name),
    trim(p_phone),
    lower(trim(p_email)),
    p_child_date_of_birth
  );
end;
$$;

revoke all on function public.register_member(text, text, text, text, text, date) from public;
grant execute on function public.register_member(text, text, text, text, text, date) to anon, authenticated;

create or replace function public.finalize_paid_order(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_order public.orders%rowtype;
  item record;
  stock_row public.product_shop_availability%rowtype;
begin
  select * into target_order
  from public.orders
  where id = p_order_id
  for update;

  if target_order.id is null then
    raise exception 'Order not found';
  end if;

  if target_order.payment_status = 'paid' then
    return;
  end if;

  for item in
    select product_id, quantity
    from public.order_items
    where order_id = p_order_id
  loop
    select * into stock_row
    from public.product_shop_availability
    where product_id = item.product_id
      and shop_id = target_order.shop_id
      and is_available = true
    for update;

    if stock_row.id is null or stock_row.stock_quantity < item.quantity then
      raise exception 'Insufficient stock';
    end if;

    update public.product_shop_availability
    set stock_quantity = stock_quantity - item.quantity,
        is_available = (stock_quantity - item.quantity) > 0
    where id = stock_row.id;
  end loop;

  update public.orders
  set payment_status = 'paid',
      order_status = 'received',
      payment_date = now(),
      updated_at = now()
  where id = p_order_id;
end;
$$;

revoke all on function public.finalize_paid_order(uuid) from public, anon, authenticated;
