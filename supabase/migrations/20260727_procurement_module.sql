-- Phase 2: Procurement module.
-- Suppliers, purchase orders, goods received notes, and weighted-average cost tracking.

create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact_name text,
  email text,
  phone text,
  address text,
  payment_terms text,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers(id) on delete restrict,
  shop_id uuid references public.shops(id) on delete set null,
  reference_number text,
  status text not null default 'draft' check (status in ('draft', 'sent', 'partial', 'received', 'cancelled')),
  total_amount numeric(12,2) not null default 0 check (total_amount >= 0),
  expected_delivery_date date,
  received_at timestamptz,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.purchase_order_items (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references public.purchase_orders(id) on delete cascade,
  variant_id uuid not null references public.product_variants(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  unit_cost numeric(12,2) not null check (unit_cost >= 0),
  received_quantity integer not null default 0 check (received_quantity >= 0 and received_quantity <= quantity),
  line_total numeric(12,2) generated always as (quantity * unit_cost) stored,
  created_at timestamptz not null default now()
);

create table if not exists public.goods_received_notes (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references public.purchase_orders(id) on delete restrict,
  received_by uuid references auth.users(id) on delete set null,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.goods_received_note_items (
  id uuid primary key default gen_random_uuid(),
  goods_received_note_id uuid not null references public.goods_received_notes(id) on delete cascade,
  purchase_order_item_id uuid not null references public.purchase_order_items(id) on delete restrict,
  variant_id uuid not null references public.product_variants(id) on delete restrict,
  quantity_received integer not null check (quantity_received > 0),
  unit_cost numeric(12,2) not null check (unit_cost >= 0),
  created_at timestamptz not null default now()
);

create index if not exists purchase_orders_supplier_idx on public.purchase_orders(supplier_id);
create index if not exists purchase_orders_status_idx on public.purchase_orders(status);
create index if not exists purchase_order_items_po_idx on public.purchase_order_items(purchase_order_id);
create index if not exists purchase_order_items_variant_idx on public.purchase_order_items(variant_id);
create index if not exists goods_received_notes_po_idx on public.goods_received_notes(purchase_order_id);

-- Supplier balance view: total PO value minus received value.
create or replace view public.supplier_balances as
select
  s.id as supplier_id,
  s.name as supplier_name,
  coalesce(sum(po.total_amount), 0) as total_purchase_orders,
  coalesce(sum(case when po.status = 'received' then po.total_amount else 0 end), 0) as received_value,
  coalesce(sum(po.total_amount), 0)
    - coalesce(sum(case when po.status = 'received' then po.total_amount else 0 end), 0) as outstanding_balance
from public.suppliers s
left join public.purchase_orders po on po.supplier_id = s.id and po.status <> 'cancelled'
group by s.id, s.name;

-- Weighted-average cost update on goods receipt.
create or replace function public.receive_purchase_order(
  p_purchase_order_id uuid,
  p_items jsonb,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_grn_id uuid;
  v_item record;
  v_po_item record;
  v_variant record;
  v_po record;
  v_total_received integer;
  v_total_ordered integer;
  v_new_on_hand integer;
  v_new_cost numeric(12,2);
  v_old_cost numeric(12,2);
  v_old_on_hand integer;
begin
  select * into v_po
  from public.purchase_orders
  where id = p_purchase_order_id
  for update;

  if v_po.id is null then
    raise exception 'Purchase order not found';
  end if;

  if v_po.status = 'received' then
    raise exception 'Purchase order already fully received';
  end if;

  if v_po.status = 'cancelled' then
    raise exception 'Cannot receive a cancelled purchase order';
  end if;

  insert into public.goods_received_notes (purchase_order_id, notes)
  values (p_purchase_order_id, p_notes)
  returning id into v_grn_id;

  for v_item in
    select
      (item ->> 'purchase_order_item_id')::uuid as purchase_order_item_id,
      (item ->> 'quantity_received')::integer as quantity_received,
      (item ->> 'unit_cost')::numeric as unit_cost
    from jsonb_array_elements(p_items) as item
  loop
    select * into v_po_item
    from public.purchase_order_items
    where id = v_item.purchase_order_item_id
      and purchase_order_id = p_purchase_order_id
    for update;

    if v_po_item.id is null then
      raise exception 'Invalid purchase order item: %', v_item.purchase_order_item_id;
    end if;

    if v_item.quantity_received <= 0 then
      raise exception 'Quantity received must be greater than zero';
    end if;

    if v_po_item.received_quantity + v_item.quantity_received > v_po_item.quantity then
      raise exception 'Received quantity exceeds ordered quantity for item %', v_po_item.id;
    end if;

    insert into public.goods_received_note_items (
      goods_received_note_id,
      purchase_order_item_id,
      variant_id,
      quantity_received,
      unit_cost
    ) values (
      v_grn_id,
      v_po_item.id,
      v_po_item.variant_id,
      v_item.quantity_received,
      coalesce(v_item.unit_cost, v_po_item.unit_cost)
    );

    update public.purchase_order_items
    set received_quantity = received_quantity + v_item.quantity_received
    where id = v_po_item.id;

    -- Update inventory level for the target shop (or first shop if PO has no shop).
    update public.inventory_levels
    set on_hand = on_hand + v_item.quantity_received,
        updated_at = now()
    where variant_id = v_po_item.variant_id
      and shop_id = coalesce(v_po.shop_id, (select id from public.shops where is_active = true order by created_at limit 1));

    if not found then
      insert into public.inventory_levels (variant_id, shop_id, on_hand)
      values (
        v_po_item.variant_id,
        coalesce(v_po.shop_id, (select id from public.shops where is_active = true order by created_at limit 1)),
        v_item.quantity_received
      );
    end if;

    -- Weighted-average cost update on the variant.
    select cost_price, coalesce(on_hand, 0) into v_old_cost, v_old_on_hand
    from public.product_variants
    where id = v_po_item.variant_id;

    v_new_on_hand := v_old_on_hand + v_item.quantity_received;
    if v_new_on_hand > 0 then
      v_new_cost := round(
        ((coalesce(v_old_cost, 0) * v_old_on_hand) + (coalesce(v_item.unit_cost, v_po_item.unit_cost) * v_item.quantity_received)) / v_new_on_hand,
        2
      );

      update public.product_variants
      set cost_price = v_new_cost,
          updated_at = now()
      where id = v_po_item.variant_id;
    end if;
  end loop;

  -- Update PO status based on received quantities.
  select sum(quantity), sum(received_quantity)
  into v_total_ordered, v_total_received
  from public.purchase_order_items
  where purchase_order_id = p_purchase_order_id;

  update public.purchase_orders
  set status = case
    when v_total_received = 0 then 'sent'
    when v_total_received >= v_total_ordered then 'received'
    else 'partial'
  end,
  received_at = case when v_total_received >= v_total_ordered then now() else received_at end,
  updated_at = now()
  where id = p_purchase_order_id;

  return v_grn_id;
end;
$$;

revoke all on function public.receive_purchase_order(uuid, jsonb, text) from public;
grant execute on function public.receive_purchase_order(uuid, jsonb, text) to authenticated, service_role;

-- Triggers for updated_at.
create or replace function private.touch_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $do$
declare
  v_table text;
begin
  foreach v_table in array array['suppliers', 'purchase_orders']
  loop
    execute format('drop trigger if exists set_updated_at on public.%I', v_table);
    execute format(
      'create trigger set_updated_at before update on public.%I for each row execute function private.touch_updated_at()',
      v_table
    );
  end loop;
end
$do$;

-- RLS policies.
alter table public.suppliers enable row level security;
alter table public.purchase_orders enable row level security;
alter table public.purchase_order_items enable row level security;
alter table public.goods_received_notes enable row level security;
alter table public.goods_received_note_items enable row level security;

drop policy if exists suppliers_admin_all on public.suppliers;
create policy suppliers_admin_all on public.suppliers
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists purchase_orders_admin_all on public.purchase_orders;
create policy purchase_orders_admin_all on public.purchase_orders
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists purchase_order_items_admin_all on public.purchase_order_items;
create policy purchase_order_items_admin_all on public.purchase_order_items
  for all to authenticated using (
    exists (select 1 from public.purchase_orders po where po.id = purchase_order_id and public.is_admin())
  ) with check (
    exists (select 1 from public.purchase_orders po where po.id = purchase_order_id and public.is_admin())
  );

drop policy if exists goods_received_notes_admin_all on public.goods_received_notes;
create policy goods_received_notes_admin_all on public.goods_received_notes
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists goods_received_note_items_admin_all on public.goods_received_note_items;
create policy goods_received_note_items_admin_all on public.goods_received_note_items
  for all to authenticated using (
    exists (
      select 1 from public.goods_received_notes grn
      join public.purchase_orders po on po.id = grn.purchase_order_id
      where grn.id = goods_received_note_id and public.is_admin()
    )
  ) with check (
    exists (
      select 1 from public.goods_received_notes grn
      join public.purchase_orders po on po.id = grn.purchase_order_id
      where grn.id = goods_received_note_id and public.is_admin()
    )
  );

grant select on public.supplier_balances to authenticated;
