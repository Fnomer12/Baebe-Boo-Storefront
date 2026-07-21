-- Additive commerce foundation for the Baebe Boo digital flagship.
-- This migration intentionally does not rename or remove the legacy products,
-- shops, orders, or operational tables used by the current storefront.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create or replace function private.has_staff_role(p_roles text[])
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
  select
    coalesce(auth.jwt() -> 'app_metadata' ->> 'staff_role', '') = any (p_roles)
    or (
      'owner' = any (p_roles)
      and exists (
        select 1
        from public.admin_users
        where lower(email) = lower(auth.jwt() ->> 'email')
          and role = 'boss'
          and is_active = true
      )
    );
$function$;

revoke all on function private.has_staff_role(text[]) from public;
grant usage on schema private to authenticated, service_role;
grant execute on function private.has_staff_role(text[]) to authenticated, service_role;

create table if not exists public.taxonomies (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references public.taxonomies(id) on delete restrict,
  kind text not null check (kind in ('category', 'age_range', 'collection', 'brand', 'tag', 'gender')),
  slug text not null,
  name text not null,
  description text,
  image_url text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (kind, slug),
  check (parent_id is null or parent_id <> id)
);

create table if not exists public.product_taxonomies (
  product_id uuid not null references public.products(id) on delete cascade,
  taxonomy_id uuid not null references public.taxonomies(id) on delete cascade,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (product_id, taxonomy_id)
);

create table if not exists public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  sku text not null unique,
  barcode text unique,
  title text not null,
  option_values jsonb not null default '{}'::jsonb,
  price numeric(12,2) not null check (price >= 0),
  compare_at_price numeric(12,2) check (compare_at_price is null or compare_at_price >= price),
  cost_price numeric(12,2) check (cost_price is null or cost_price >= 0),
  weight_grams integer check (weight_grams is null or weight_grams >= 0),
  is_default boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists product_variants_one_default
  on public.product_variants(product_id) where is_default;
create index if not exists product_variants_product_idx on public.product_variants(product_id);

create table if not exists public.product_media (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  variant_id uuid references public.product_variants(id) on delete cascade,
  media_type text not null check (media_type in ('image', 'video', 'model_3d')),
  url text not null,
  alt_text text,
  width integer check (width is null or width > 0),
  height integer check (height is null or height > 0),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists product_media_product_idx on public.product_media(product_id, sort_order);

create table if not exists public.inventory_levels (
  id uuid primary key default gen_random_uuid(),
  variant_id uuid not null references public.product_variants(id) on delete cascade,
  shop_id uuid not null references public.shops(id) on delete cascade,
  on_hand integer not null default 0 check (on_hand >= 0),
  reserved integer not null default 0 check (reserved >= 0 and reserved <= on_hand),
  reorder_point integer not null default 0 check (reorder_point >= 0),
  updated_at timestamptz not null default now(),
  unique (variant_id, shop_id)
);

create table if not exists public.inventory_reservations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  order_id uuid references public.orders(id) on delete set null,
  guest_token_hash text,
  status text not null default 'active' check (status in ('active', 'confirmed', 'released', 'expired')),
  expires_at timestamptz not null,
  confirmed_at timestamptz,
  released_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (user_id is not null or guest_token_hash is not null or order_id is not null)
);

create index if not exists inventory_reservations_expiry_idx
  on public.inventory_reservations(expires_at) where status = 'active';

create table if not exists public.inventory_reservation_items (
  reservation_id uuid not null references public.inventory_reservations(id) on delete cascade,
  inventory_level_id uuid not null references public.inventory_levels(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  created_at timestamptz not null default now(),
  primary key (reservation_id, inventory_level_id)
);

create table if not exists public.fulfilment_allocations (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  shop_id uuid not null references public.shops(id) on delete restrict,
  fulfilment_type text not null check (fulfilment_type in ('delivery', 'pickup')),
  status text not null default 'pending' check (status in ('pending', 'allocated', 'picking', 'ready', 'shipped', 'completed', 'cancelled')),
  delivery_fee numeric(12,2) not null default 0 check (delivery_fee >= 0),
  pickup_slot_start timestamptz,
  pickup_slot_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (pickup_slot_end is null or pickup_slot_start is not null),
  check (pickup_slot_end is null or pickup_slot_end > pickup_slot_start)
);

create index if not exists fulfilment_allocations_order_idx on public.fulfilment_allocations(order_id);

create table if not exists public.fulfilment_allocation_items (
  allocation_id uuid not null references public.fulfilment_allocations(id) on delete cascade,
  order_item_id uuid not null references public.order_items(id) on delete restrict,
  variant_id uuid references public.product_variants(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  primary key (allocation_id, order_item_id)
);

create table if not exists public.shipments (
  id uuid primary key default gen_random_uuid(),
  allocation_id uuid not null references public.fulfilment_allocations(id) on delete restrict,
  carrier text,
  tracking_number text,
  tracking_url text,
  status text not null default 'pending' check (status in ('pending', 'label_created', 'in_transit', 'out_for_delivery', 'delivered', 'failed', 'returned')),
  shipped_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (carrier, tracking_number)
);

create table if not exists public.shipment_events (
  id bigint generated always as identity primary key,
  shipment_id uuid not null references public.shipments(id) on delete cascade,
  status text not null,
  description text,
  location text,
  occurred_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists shipment_events_shipment_idx on public.shipment_events(shipment_id, occurred_at desc);

create table if not exists public.customer_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  phone text,
  date_of_birth date,
  marketing_status text not null default 'unknown' check (marketing_status in ('unknown', 'subscribed', 'unsubscribed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.customer_children (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.customer_profiles(user_id) on delete cascade,
  first_name text,
  date_of_birth date,
  age_range_taxonomy_id uuid references public.taxonomies(id) on delete set null,
  created_at timestamptz not null default now(),
  check (first_name is not null or date_of_birth is not null or age_range_taxonomy_id is not null)
);

create table if not exists public.customer_addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.customer_profiles(user_id) on delete cascade,
  label text,
  recipient_name text not null,
  phone text not null,
  address_line_1 text not null,
  address_line_2 text,
  city text not null,
  region text not null,
  digital_address text,
  delivery_instructions text,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists customer_addresses_one_default
  on public.customer_addresses(user_id) where is_default;

create table if not exists public.customer_consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  email text,
  phone text,
  purpose text not null,
  channel text not null check (channel in ('email', 'sms', 'whatsapp', 'analytics', 'advertising')),
  status text not null check (status in ('granted', 'withdrawn')),
  policy_version text not null,
  source text not null,
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  check (user_id is not null or email is not null or phone is not null)
);

create index if not exists customer_consents_subject_idx
  on public.customer_consents(user_id, purpose, channel, occurred_at desc);

create table if not exists public.wishlists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'Wishlist',
  is_public boolean not null default false,
  public_token uuid unique default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.wishlist_items (
  wishlist_id uuid not null references public.wishlists(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  variant_id uuid references public.product_variants(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (wishlist_id, product_id)
);

create table if not exists public.product_reviews (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  order_id uuid references public.orders(id) on delete set null,
  rating smallint not null check (rating between 1 and 5),
  title text,
  body text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  is_verified_purchase boolean not null default false,
  merchant_reply text,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, user_id, order_id)
);

create index if not exists product_reviews_public_idx
  on public.product_reviews(product_id, published_at desc) where status = 'approved';

create table if not exists public.review_media (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.product_reviews(id) on delete cascade,
  media_type text not null check (media_type in ('image', 'video')),
  url text not null,
  moderation_status text not null default 'pending' check (moderation_status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now()
);

create table if not exists public.review_votes (
  review_id uuid not null references public.product_reviews(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  is_helpful boolean not null,
  created_at timestamptz not null default now(),
  primary key (review_id, user_id)
);

create table if not exists public.reward_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  available_points bigint not null default 0 check (available_points >= 0),
  pending_points bigint not null default 0 check (pending_points >= 0),
  lifetime_points bigint not null default 0 check (lifetime_points >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.reward_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  order_id uuid references public.orders(id) on delete set null,
  entry_type text not null check (entry_type in ('earn', 'redeem', 'expire', 'reverse', 'adjust')),
  points bigint not null check (points <> 0),
  status text not null default 'available' check (status in ('pending', 'available', 'void')),
  reason text not null,
  expires_at timestamptz,
  source_key text unique,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  available_at timestamptz
);

create index if not exists reward_ledger_user_idx on public.reward_ledger(user_id, created_at desc);

create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_user_id uuid not null references auth.users(id) on delete restrict,
  referred_user_id uuid references auth.users(id) on delete set null,
  code text not null unique,
  status text not null default 'invited' check (status in ('invited', 'qualified', 'rewarded', 'rejected')),
  qualifying_order_id uuid references public.orders(id) on delete set null,
  created_at timestamptz not null default now(),
  qualified_at timestamptz,
  rewarded_at timestamptz,
  check (referred_user_id is null or referred_user_id <> referrer_user_id)
);

create table if not exists public.gift_registries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  event_date date,
  public_token uuid not null unique default gen_random_uuid(),
  status text not null default 'active' check (status in ('draft', 'active', 'closed')),
  shipping_address_id uuid references public.customer_addresses(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.gift_registry_items (
  registry_id uuid not null references public.gift_registries(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  variant_id uuid references public.product_variants(id) on delete restrict,
  requested_quantity integer not null default 1 check (requested_quantity > 0),
  purchased_quantity integer not null default 0 check (purchased_quantity >= 0 and purchased_quantity <= requested_quantity),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high')),
  primary key (registry_id, product_id)
);

create table if not exists public.content_authors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  name text not null,
  bio text,
  avatar_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.content_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid references public.content_authors(id) on delete set null,
  slug text not null unique,
  title text not null,
  excerpt text,
  body jsonb not null default '{}'::jsonb,
  hero_image_url text,
  status text not null default 'draft' check (status in ('draft', 'scheduled', 'published', 'archived')),
  seo_title text,
  seo_description text,
  published_at timestamptz,
  scheduled_for timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'scheduled' or scheduled_for is not null)
);

create table if not exists public.content_post_taxonomies (
  post_id uuid not null references public.content_posts(id) on delete cascade,
  taxonomy_id uuid not null references public.taxonomies(id) on delete cascade,
  primary key (post_id, taxonomy_id)
);

create table if not exists public.content_post_products (
  post_id uuid not null references public.content_posts(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  sort_order integer not null default 0,
  primary key (post_id, product_id)
);

create table if not exists public.promotions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  promotion_type text not null check (promotion_type in ('percentage', 'fixed_amount', 'fixed_price', 'free_shipping', 'bundle')),
  value numeric(12,2) not null check (value >= 0),
  status text not null default 'draft' check (status in ('draft', 'active', 'paused', 'expired')),
  starts_at timestamptz,
  ends_at timestamptz,
  minimum_order_amount numeric(12,2) check (minimum_order_amount is null or minimum_order_amount >= 0),
  usage_limit integer check (usage_limit is null or usage_limit > 0),
  per_customer_limit integer check (per_customer_limit is null or per_customer_limit > 0),
  stackable boolean not null default false,
  automatic boolean not null default false,
  rules jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or starts_at is null or ends_at > starts_at)
);

create table if not exists public.promotion_codes (
  id uuid primary key default gen_random_uuid(),
  promotion_id uuid not null references public.promotions(id) on delete cascade,
  code text not null unique,
  usage_count integer not null default 0 check (usage_count >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.promotion_products (
  promotion_id uuid not null references public.promotions(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  is_excluded boolean not null default false,
  primary key (promotion_id, product_id)
);

create table if not exists public.applied_promotions (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  promotion_id uuid references public.promotions(id) on delete set null,
  code text,
  promotion_snapshot jsonb not null,
  discount_amount numeric(12,2) not null check (discount_amount >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.delivery_zones (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  regions jsonb not null default '[]'::jsonb,
  digital_address_prefixes text[] not null default '{}',
  base_fee numeric(12,2) not null default 0 check (base_fee >= 0),
  free_delivery_threshold numeric(12,2) check (free_delivery_threshold is null or free_delivery_threshold >= 0),
  estimated_days_min integer check (estimated_days_min is null or estimated_days_min >= 0),
  estimated_days_max integer check (estimated_days_max is null or estimated_days_max >= estimated_days_min),
  rate_rules jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pickup_slots (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  capacity integer not null check (capacity > 0),
  reserved_count integer not null default 0 check (reserved_count >= 0 and reserved_count <= capacity),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (shop_id, starts_at),
  check (ends_at > starts_at)
);

create table if not exists public.payment_attempts (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  provider text not null,
  provider_reference text not null unique,
  amount numeric(12,2) not null check (amount > 0),
  currency text not null default 'GHS',
  channel text,
  status text not null default 'initialized' check (status in ('initialized', 'pending', 'paid', 'failed', 'abandoned', 'refunded')),
  verified_at timestamptz,
  provider_response jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.return_requests (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  user_id uuid references auth.users(id) on delete set null,
  status text not null default 'requested' check (status in ('requested', 'approved', 'rejected', 'received', 'completed', 'cancelled')),
  reason text not null,
  notes text,
  requested_at timestamptz not null default now(),
  resolved_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.return_items (
  return_id uuid not null references public.return_requests(id) on delete cascade,
  order_item_id uuid not null references public.order_items(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  condition text,
  resolution text check (resolution is null or resolution in ('refund', 'exchange', 'store_credit')),
  primary key (return_id, order_item_id)
);

create table if not exists public.refunds (
  id uuid primary key default gen_random_uuid(),
  return_id uuid references public.return_requests(id) on delete set null,
  payment_attempt_id uuid references public.payment_attempts(id) on delete restrict,
  provider_reference text unique,
  amount numeric(12,2) not null check (amount > 0),
  status text not null default 'pending' check (status in ('pending', 'processing', 'succeeded', 'failed')),
  reason text not null,
  processed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.promotion_redemptions (
  id uuid primary key default gen_random_uuid(),
  promotion_id uuid not null references public.promotions(id) on delete restrict,
  promotion_code_id uuid references public.promotion_codes(id) on delete restrict,
  order_id uuid not null references public.orders(id) on delete restrict,
  user_id uuid references auth.users(id) on delete set null,
  discount_amount numeric(12,2) not null check (discount_amount >= 0),
  created_at timestamptz not null default now(),
  unique (promotion_id, order_id)
);

create table if not exists public.product_comparisons (
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, product_id)
);

create table if not exists public.recently_viewed_products (
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  last_viewed_at timestamptz not null default now(),
  view_count integer not null default 1 check (view_count > 0),
  primary key (user_id, product_id)
);

create table if not exists public.commerce_events (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete set null,
  anonymous_id uuid,
  session_id uuid,
  event_name text not null,
  product_id uuid references public.products(id) on delete set null,
  variant_id uuid references public.product_variants(id) on delete set null,
  order_id uuid references public.orders(id) on delete set null,
  properties jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  check (user_id is not null or anonymous_id is not null)
);

create index if not exists commerce_events_product_idx on public.commerce_events(product_id, event_name, occurred_at desc);

alter table public.orders
  add column if not exists customer_user_id uuid references auth.users(id) on delete set null;
create index if not exists orders_customer_user_idx on public.orders(customer_user_id, created_at desc);

-- Give every legacy product a stable default variant and carry current branch stock
-- into the normalized inventory model. Re-running never duplicates either record.
insert into public.product_variants (product_id, sku, title, price, is_default, is_active)
select p.id, 'legacy-' || p.id::text, p.name, p.price, true, p.is_active
from public.products p
where not exists (select 1 from public.product_variants v where v.product_id = p.id)
on conflict (sku) do nothing;

insert into public.inventory_levels (variant_id, shop_id, on_hand, reserved)
select v.id, availability.shop_id, greatest(availability.stock_quantity, 0), 0
from public.product_shop_availability availability
join public.product_variants v on v.product_id = availability.product_id and v.is_default
on conflict (variant_id, shop_id) do update
  set on_hand = greatest(public.inventory_levels.reserved, excluded.on_hand),
      updated_at = now();

create table if not exists public.audit_logs (
  id bigint generated always as identity primary key,
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_role text,
  action text not null,
  table_name text not null,
  record_id text,
  old_values jsonb,
  new_values jsonb,
  request_id text,
  occurred_at timestamptz not null default now()
);

create index if not exists audit_logs_record_idx on public.audit_logs(table_name, record_id, occurred_at desc);

create or replace function private.touch_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

create or replace function private.capture_audit_log()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_old jsonb;
  v_new jsonb;
  v_record_id text;
begin
  if tg_op = 'INSERT' then
    v_new := to_jsonb(new);
    v_record_id := v_new ->> 'id';
  elsif tg_op = 'UPDATE' then
    v_old := to_jsonb(old);
    v_new := to_jsonb(new);
    v_record_id := coalesce(v_new ->> 'id', v_old ->> 'id');
  else
    v_old := to_jsonb(old);
    v_record_id := v_old ->> 'id';
  end if;

  insert into public.audit_logs (
    actor_user_id, actor_role, action, table_name, record_id,
    old_values, new_values, request_id
  ) values (
    auth.uid(),
    coalesce(auth.jwt() -> 'app_metadata' ->> 'staff_role', auth.jwt() ->> 'role'),
    lower(tg_op), tg_table_name, v_record_id,
    v_old, v_new, nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-request-id'
  );
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$function$;

revoke all on function private.touch_updated_at() from public;
revoke all on function private.capture_audit_log() from public;

do $do$
declare
  v_table text;
begin
  foreach v_table in array array[
    'taxonomies', 'product_variants', 'inventory_levels', 'inventory_reservations',
    'fulfilment_allocations', 'shipments', 'customer_profiles', 'customer_addresses',
    'product_reviews', 'reward_accounts', 'gift_registries', 'content_posts', 'promotions'
  ]
  loop
    execute format('drop trigger if exists set_updated_at on public.%I', v_table);
    execute format(
      'create trigger set_updated_at before update on public.%I for each row execute function private.touch_updated_at()',
      v_table
    );
  end loop;

  foreach v_table in array array[
    'product_variants', 'inventory_levels', 'inventory_reservations',
    'fulfilment_allocations', 'shipments', 'product_reviews', 'reward_ledger',
    'content_posts', 'promotions', 'promotion_codes'
  ]
  loop
    execute format('drop trigger if exists capture_audit_log on public.%I', v_table);
    execute format(
      'create trigger capture_audit_log after insert or update or delete on public.%I for each row execute function private.capture_audit_log()',
      v_table
    );
  end loop;
end
$do$;

-- Route-handler RPCs: the private schema is intentionally not exposed by
-- PostgREST, so narrowly scoped public wrappers are callable only by service_role.
create or replace function public.reserve_checkout(
  p_items jsonb,
  p_order_id uuid default null,
  p_user_id uuid default null,
  p_guest_token_hash text default null,
  p_expires_at timestamptz default now() + interval '15 minutes'
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_reservation_id uuid;
  v_item record;
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'At least one inventory item is required';
  end if;
  if p_expires_at <= now() then
    raise exception 'Reservation expiry must be in the future';
  end if;

  insert into public.inventory_reservations (user_id, order_id, guest_token_hash, expires_at)
  values (p_user_id, p_order_id, p_guest_token_hash, p_expires_at)
  returning id into v_reservation_id;

  -- Sorting locks inventory rows consistently across concurrent carts and avoids
  -- deadlocks. Any shortage raises, rolling the entire function transaction back.
  for v_item in
    select
      (entry ->> 'inventory_level_id')::uuid as inventory_level_id,
      sum((entry ->> 'quantity')::integer)::integer as quantity
    from jsonb_array_elements(p_items) entry
    group by (entry ->> 'inventory_level_id')::uuid
    order by (entry ->> 'inventory_level_id')::uuid
  loop
    perform private.reserve_inventory(v_reservation_id, v_item.inventory_level_id, v_item.quantity);
  end loop;

  return v_reservation_id;
end;
$function$;

create or replace function public.release_checkout_reservation(p_reservation_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, private
as $function$
begin
  perform private.release_reservation(p_reservation_id);
end;
$function$;

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
begin
  select payment_status into v_payment_status
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

  -- Keep the legacy availability table synchronized while existing admin and
  -- counter screens are migrated to inventory_levels. Allocation shop_id is
  -- used per item, so split orders never debit every item from the primary shop.
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
end;
$function$;

revoke all on function public.reserve_checkout(jsonb, uuid, uuid, text, timestamptz) from public, anon, authenticated;
revoke all on function public.release_checkout_reservation(uuid) from public, anon, authenticated;
revoke all on function public.finalize_checkout_reservation(uuid, uuid) from public, anon, authenticated;
grant execute on function public.reserve_checkout(jsonb, uuid, uuid, text, timestamptz) to service_role;
grant execute on function public.release_checkout_reservation(uuid) to service_role;
grant execute on function public.finalize_checkout_reservation(uuid, uuid) to service_role;

-- Final grants are deliberately after the blanket revocation above.
grant select on public.orders, public.order_items to authenticated;
grant insert on public.commerce_events to anon, authenticated;
grant usage, select on sequence public.commerce_events_id_seq to anon, authenticated;
revoke all on public.return_items from authenticated;
grant select, insert, delete on public.return_items to authenticated;

-- Staff table policies default to the two broad operational roles. Narrower roles
-- use server-side modules with service credentials and explicit application checks.
do $do$
declare
  v_table text;
begin
  foreach v_table in array array[
    'taxonomies', 'product_taxonomies', 'product_variants', 'product_media',
    'inventory_levels', 'inventory_reservations', 'inventory_reservation_items',
    'fulfilment_allocations', 'fulfilment_allocation_items', 'shipments', 'shipment_events',
    'customer_profiles', 'customer_children', 'customer_addresses', 'customer_consents',
    'wishlists', 'wishlist_items', 'product_reviews', 'review_media', 'review_votes',
    'reward_accounts', 'reward_ledger', 'referrals', 'gift_registries', 'gift_registry_items',
    'content_authors', 'content_posts', 'content_post_taxonomies', 'content_post_products',
    'promotions', 'promotion_codes', 'promotion_products', 'applied_promotions',
    'delivery_zones', 'pickup_slots', 'payment_attempts', 'return_requests', 'return_items',
    'refunds', 'promotion_redemptions', 'product_comparisons', 'recently_viewed_products',
    'commerce_events', 'audit_logs'
  ]
  loop
    execute format('drop policy if exists staff_manage on public.%I', v_table);
    execute format(
      'create policy staff_manage on public.%I for all to authenticated using (private.has_staff_role(ARRAY[''owner'',''manager''])) with check (private.has_staff_role(ARRAY[''owner'',''manager'']))',
      v_table
    );
  end loop;
end
$do$;

-- Customer ownership for legacy orders is additive and does not change guest tracking.
grant select on public.orders, public.order_items to authenticated;
drop policy if exists orders_customer_read on public.orders;
create policy orders_customer_read on public.orders for select to authenticated
  using ((select auth.uid()) = customer_user_id);
drop policy if exists order_items_customer_read on public.order_items;
create policy order_items_customer_read on public.order_items for select to authenticated
  using (exists (
    select 1 from public.orders o where o.id = order_id and o.customer_user_id = (select auth.uid())
  ));

drop policy if exists fulfilment_allocations_customer_read on public.fulfilment_allocations;
create policy fulfilment_allocations_customer_read on public.fulfilment_allocations for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id and o.customer_user_id = (select auth.uid())));
drop policy if exists fulfilment_allocation_items_customer_read on public.fulfilment_allocation_items;
create policy fulfilment_allocation_items_customer_read on public.fulfilment_allocation_items for select to authenticated
  using (exists (
    select 1 from public.fulfilment_allocations a join public.orders o on o.id = a.order_id
    where a.id = allocation_id and o.customer_user_id = (select auth.uid())
  ));
drop policy if exists shipments_customer_read on public.shipments;
create policy shipments_customer_read on public.shipments for select to authenticated
  using (exists (
    select 1 from public.fulfilment_allocations a join public.orders o on o.id = a.order_id
    where a.id = allocation_id and o.customer_user_id = (select auth.uid())
  ));
drop policy if exists shipment_events_customer_read on public.shipment_events;
create policy shipment_events_customer_read on public.shipment_events for select to authenticated
  using (exists (
    select 1 from public.shipments s join public.fulfilment_allocations a on a.id = s.allocation_id
      join public.orders o on o.id = a.order_id
    where s.id = shipment_id and o.customer_user_id = (select auth.uid())
  ));
drop policy if exists payment_attempts_customer_read on public.payment_attempts;
create policy payment_attempts_customer_read on public.payment_attempts for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id and o.customer_user_id = (select auth.uid())));
drop policy if exists promotion_redemptions_customer_read on public.promotion_redemptions;
create policy promotion_redemptions_customer_read on public.promotion_redemptions for select to authenticated
  using ((select auth.uid()) = user_id);
drop policy if exists applied_promotions_customer_read on public.applied_promotions;
create policy applied_promotions_customer_read on public.applied_promotions for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id and o.customer_user_id = (select auth.uid())));

create or replace function public.claim_my_guest_orders()
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_user_id uuid := auth.uid();
  v_email text := lower(auth.jwt() ->> 'email');
  v_count integer;
begin
  if v_user_id is null or v_email is null or v_email = '' then
    raise exception 'A verified authenticated email is required';
  end if;
  if not exists (
    select 1 from auth.users u
    where u.id = v_user_id
      and u.email_confirmed_at is not null
      and lower(u.email) = v_email
  ) then
    raise exception 'A verified authenticated email is required';
  end if;

  update public.orders
  set customer_user_id = v_user_id,
      updated_at = now()
  where customer_user_id is null
    and lower(customer_email) = v_email;
  get diagnostics v_count = row_count;
  return v_count;
end;
$function$;

revoke all on function public.claim_my_guest_orders() from public, anon;
grant execute on function public.claim_my_guest_orders() to authenticated;

create or replace function public.get_product_availability(p_product_ids uuid[])
returns table (product_id uuid, availability text)
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
  select
    v.product_id,
    case
      when sum(greatest(level.on_hand - level.reserved, 0)) = 0 then 'out_of_stock'
      when sum(greatest(level.on_hand - level.reserved, 0)) <= 5 then 'low_stock'
      else 'in_stock'
    end
  from public.product_variants v
  join public.inventory_levels level on level.variant_id = v.id
  where v.product_id = any (p_product_ids)
    and v.is_active
  group by v.product_id;
$function$;

revoke all on function public.get_product_availability(uuid[]) from public;
grant execute on function public.get_product_availability(uuid[]) to anon, authenticated, service_role;

create or replace function public.get_frequently_bought_together(
  p_product_id uuid,
  p_limit integer default 4
)
returns table (product_id uuid, purchase_count bigint)
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
  select other_item.product_id, count(distinct source_item.order_id) as purchase_count
  from public.order_items source_item
  join public.orders paid_order on paid_order.id = source_item.order_id
  join public.order_items other_item
    on other_item.order_id = source_item.order_id
   and other_item.product_id <> source_item.product_id
  join public.products product on product.id = other_item.product_id
  where source_item.product_id = p_product_id
    and paid_order.payment_status = 'paid'
    and product.is_active
  group by other_item.product_id
  order by purchase_count desc, other_item.product_id
  limit least(greatest(p_limit, 1), 12);
$function$;
revoke all on function public.get_frequently_bought_together(uuid, integer) from public;
grant execute on function public.get_frequently_bought_together(uuid, integer)
  to anon, authenticated, service_role;

-- Harden the compatibility helper and its legacy public-read policies. Anonymous
-- catalog reads no longer evaluate a privileged staff lookup.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, private
as $function$
  select private.has_staff_role(array['owner']);
$function$;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated, service_role;

drop policy if exists products_public_read on public.products;
create policy products_public_read on public.products for select to anon, authenticated using (is_active = true);
drop policy if exists shops_public_read on public.shops;
create policy shops_public_read on public.shops for select to anon, authenticated using (is_active = true);

-- The current Paystack server flow calls the compatibility transaction directly.
revoke all on function public.finalize_paid_order(uuid) from public, anon, authenticated;
grant execute on function public.finalize_paid_order(uuid) to service_role;

revoke all on public.return_items from authenticated;
grant select, insert, delete on public.return_items to authenticated;
grant insert on public.commerce_events to anon, authenticated;
grant usage, select on sequence public.commerce_events_id_seq to anon, authenticated;
drop policy if exists commerce_events_anon_insert on public.commerce_events;
create policy commerce_events_anon_insert on public.commerce_events for insert to anon
  with check (user_id is null and anonymous_id is not null);
drop policy if exists commerce_events_user_insert on public.commerce_events;
create policy commerce_events_user_insert on public.commerce_events for insert to authenticated
  with check (user_id = (select auth.uid()));

grant all on all sequences in schema public to service_role;

create or replace function private.bootstrap_customer_account()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
begin
  insert into public.customer_profiles (user_id, email, full_name)
  values (new.id, lower(new.email), nullif(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (user_id) do nothing;
  insert into public.reward_accounts (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$function$;
revoke all on function private.bootstrap_customer_account() from public, anon, authenticated;
drop trigger if exists bootstrap_customer_account on auth.users;
create trigger bootstrap_customer_account
  after insert on auth.users
  for each row execute function private.bootstrap_customer_account();

-- Existing accounts are safe to backfill repeatedly.
insert into public.customer_profiles (user_id, email, full_name)
select id, lower(email), nullif(raw_user_meta_data ->> 'full_name', '') from auth.users
on conflict (user_id) do nothing;
insert into public.reward_accounts (user_id)
select id from auth.users
on conflict (user_id) do nothing;

create or replace function public.transition_order(p_order_id uuid, p_next_status text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_order public.orders%rowtype;
  v_completed_order_id uuid;
  v_allowed boolean;
  v_shipping_status text;
  v_now timestamptz := now();
begin
  if not (
    coalesce(auth.jwt() ->> 'role', '') = 'service_role'
    or private.has_staff_role(array['owner', 'manager', 'support'])
  ) then
    raise exception 'Not authorized';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if v_order.id is null then raise exception 'Order not found'; end if;
  if v_order.order_status = p_next_status then return; end if;

  v_allowed := case v_order.order_status
    when 'pending_payment' then p_next_status = any(array['payment_failed','received','cancelled'])
    when 'payment_failed' then p_next_status = any(array['pending_payment','cancelled'])
    when 'received' then p_next_status = any(array['processing','on_hold','cancelled','refunded'])
    when 'processing' then p_next_status = any(array['on_hold','dispatched','shipped','cancelled','refunded'])
    when 'on_hold' then p_next_status = any(array['processing','cancelled','refunded'])
    when 'dispatched' then p_next_status = any(array['shipped','delivered','refunded'])
    when 'shipped' then p_next_status = any(array['delivered','refunded'])
    when 'delivered' then p_next_status = any(array['completed','refunded'])
    else false
  end;
  if not v_allowed then
    raise exception 'Cannot transition order from % to %', v_order.order_status, p_next_status;
  end if;

  v_shipping_status := case
    when p_next_status in ('dispatched', 'shipped') then 'shipped'
    when p_next_status in ('delivered', 'completed') then 'delivered'
    when p_next_status in ('cancelled', 'refunded') then 'cancelled'
    else coalesce(v_order.shipping_status, 'pending')
  end;

  update public.orders
  set order_status = p_next_status,
      shipping_status = v_shipping_status,
      shipped_at = case when p_next_status in ('dispatched','shipped') then coalesce(shipped_at, v_now) else shipped_at end,
      delivered_at = case when p_next_status in ('delivered','completed') then coalesce(delivered_at, v_now) else delivered_at end,
      updated_at = v_now
  where id = p_order_id;

  if p_next_status = 'completed' then
    select id into v_completed_order_id
    from public.completed_orders
    where original_order_id = p_order_id
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
        item.quantity, product.price
      from public.order_items item
      join public.products product on product.id = item.product_id
      where item.order_id = p_order_id;
    end if;
  end if;

  insert into public.audit_logs (actor_user_id, actor_role, action, table_name, record_id, old_values, new_values)
  values (
    auth.uid(), coalesce(auth.jwt() -> 'app_metadata' ->> 'staff_role', auth.jwt() ->> 'role'),
    'transition', 'orders', p_order_id::text,
    jsonb_build_object('order_status', v_order.order_status, 'shipping_status', v_order.shipping_status),
    jsonb_build_object('order_status', p_next_status, 'shipping_status', v_shipping_status)
  );
end;
$function$;
revoke all on function public.transition_order(uuid, text) from public, anon;
grant execute on function public.transition_order(uuid, text) to authenticated, service_role;

create or replace function public.complete_counter_sale(
  p_staff_id uuid,
  p_items jsonb,
  p_payment_method text,
  p_customer_name text default 'Walk-in Customer',
  p_customer_phone text default ''
)
returns table (order_id uuid, order_number text)
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_shop_id uuid;
  v_order_id uuid;
  v_completed_order_id uuid;
  v_order_number text := 'BB-POS-' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS');
  v_total numeric(12,2) := 0;
  v_item record;
  v_changed integer;
begin
  if p_payment_method not in ('cash', 'visa', 'momo') then
    raise exception 'Unsupported payment method';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'At least one sale item is required';
  end if;

  if coalesce(auth.jwt() ->> 'role', '') = 'service_role' then
    select staff.shop_id into v_shop_id from public.shop_staff staff where staff.id = p_staff_id;
  else
    select staff.shop_id into v_shop_id
    from public.staff_authorizations authorization
    join public.shop_staff staff on staff.id = authorization.staff_id
    where authorization.staff_id = p_staff_id
      and authorization.active
      and lower(authorization.email) = lower(auth.jwt() ->> 'email');
  end if;
  if v_shop_id is null then raise exception 'Counter is not authorized for a shop'; end if;

  for v_item in
    select
      (entry ->> 'variant_id')::uuid as variant_id,
      sum((entry ->> 'quantity')::integer)::integer as quantity
    from jsonb_array_elements(p_items) entry
    group by (entry ->> 'variant_id')::uuid
    order by (entry ->> 'variant_id')::uuid
  loop
    if v_item.quantity <= 0 then raise exception 'Sale quantities must be positive'; end if;
    update public.inventory_levels level
    set on_hand = level.on_hand - v_item.quantity, updated_at = now()
    where level.variant_id = v_item.variant_id
      and level.shop_id = v_shop_id
      and level.on_hand - level.reserved >= v_item.quantity;
    get diagnostics v_changed = row_count;
    if v_changed <> 1 then raise exception 'Insufficient inventory for variant %', v_item.variant_id; end if;

    select v_total + variant.price * v_item.quantity into v_total
    from public.product_variants variant
    where variant.id = v_item.variant_id and variant.is_active;
    if not found then raise exception 'Unknown or inactive variant %', v_item.variant_id; end if;
  end loop;

  insert into public.orders (
    order_number, customer_name, customer_phone, customer_email, delivery_address,
    shop_id, total_amount, order_status, payment_method, payment_status, order_type,
    payment_date
  ) values (
    v_order_number, trim(p_customer_name), trim(p_customer_phone), '', '',
    v_shop_id, v_total, 'completed', p_payment_method, 'paid', 'instore', now()
  ) returning id into v_order_id;

  insert into public.order_items (order_id, product_id, product_name, quantity)
  select v_order_id, variant.product_id, product.name, item.quantity
  from (
    select (entry ->> 'variant_id')::uuid variant_id, sum((entry ->> 'quantity')::integer)::integer quantity
    from jsonb_array_elements(p_items) entry group by (entry ->> 'variant_id')::uuid
  ) item
  join public.product_variants variant on variant.id = item.variant_id
  join public.products product on product.id = variant.product_id;

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
    jsonb_build_object('shop_id', v_shop_id, 'staff_id', p_staff_id, 'total', v_total));

  return query select v_order_id, v_order_number;
end;
$function$;
revoke all on function public.complete_counter_sale(uuid, jsonb, text, text, text) from public, anon;
grant execute on function public.complete_counter_sale(uuid, jsonb, text, text, text) to authenticated, service_role;

create or replace function public.join_family(
  p_parent_name text,
  p_child_first_name text,
  p_child_last_name text,
  p_phone text,
  p_email text,
  p_child_date_of_birth date,
  p_policy_version text,
  p_source text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_member_id uuid;
  v_email text := lower(trim(p_email));
  v_phone text := trim(p_phone);
begin
  if length(trim(p_parent_name)) = 0
    or length(trim(p_child_first_name)) = 0
    or length(trim(p_child_last_name)) = 0
    or length(v_phone) < 7
    or position('@' in v_email) < 2
    or length(trim(p_policy_version)) = 0
    or length(trim(p_source)) = 0 then
    raise exception 'Invalid family membership details';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_email || ':' || v_phone, 0));
  select id into v_member_id from public.members
  where lower(email) = v_email and phone = v_phone
  order by created_at limit 1;

  if v_member_id is null then
    insert into public.members (
      parent_name, child_first_name, child_last_name, phone, email, child_date_of_birth
    ) values (
      trim(p_parent_name), trim(p_child_first_name), trim(p_child_last_name),
      v_phone, v_email, p_child_date_of_birth
    ) returning id into v_member_id;
  end if;

  insert into public.customer_consents (
    email, phone, purpose, channel, status, policy_version, source
  ) values
    (v_email, v_phone, 'family_marketing', 'email', 'granted', trim(p_policy_version), trim(p_source)),
    (v_email, v_phone, 'family_marketing', 'whatsapp', 'granted', trim(p_policy_version), trim(p_source));
  return v_member_id;
end;
$function$;
revoke all on function public.join_family(text, text, text, text, text, date, text, text)
  from public, anon, authenticated;
grant execute on function public.join_family(text, text, text, text, text, date, text, text)
  to service_role;

-- Retire the anonymous legacy mutation now that enrollment passes through a
-- validated, rate-limited server route.
revoke all on function public.register_member(text, text, text, text, text, date)
  from public, anon, authenticated;
grant execute on function public.register_member(text, text, text, text, text, date)
  to service_role;
revoke all on function public.is_authorized_counter(uuid) from public, anon;
grant execute on function public.is_authorized_counter(uuid) to authenticated, service_role;

create or replace function private.reserve_inventory(
  p_reservation_id uuid,
  p_inventory_level_id uuid,
  p_quantity integer
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_changed integer;
begin
  if p_quantity <= 0 then
    raise exception 'Reservation quantity must be positive';
  end if;

  perform 1
  from public.inventory_reservations
  where id = p_reservation_id
    and status = 'active'
    and expires_at > now()
  for update;
  if not found then
    raise exception 'Reservation is not active';
  end if;

  update public.inventory_levels
  set reserved = reserved + p_quantity,
      updated_at = now()
  where id = p_inventory_level_id
    and on_hand - reserved >= p_quantity;
  get diagnostics v_changed = row_count;
  if v_changed <> 1 then
    raise exception 'Insufficient available inventory';
  end if;

  insert into public.inventory_reservation_items (
    reservation_id, inventory_level_id, quantity
  ) values (
    p_reservation_id, p_inventory_level_id, p_quantity
  )
  on conflict (reservation_id, inventory_level_id) do update
    set quantity = public.inventory_reservation_items.quantity + excluded.quantity;
end;
$function$;

create or replace function private.release_reservation(p_reservation_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_status text;
begin
  select status into v_status
  from public.inventory_reservations
  where id = p_reservation_id
  for update;

  if v_status is null then
    raise exception 'Reservation not found';
  end if;
  if v_status <> 'active' then
    return;
  end if;

  update public.inventory_levels as level
  set reserved = level.reserved - item.quantity,
      updated_at = now()
  from public.inventory_reservation_items as item
  where item.reservation_id = p_reservation_id
    and level.id = item.inventory_level_id;

  update public.inventory_reservations
  set status = case when expires_at <= now() then 'expired' else 'released' end,
      released_at = now(),
      updated_at = now()
  where id = p_reservation_id;
end;
$function$;

create or replace function private.confirm_reservation(p_reservation_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_status text;
begin
  select status into v_status
  from public.inventory_reservations
  where id = p_reservation_id
  for update;
  if v_status is null then
    raise exception 'Reservation not found';
  end if;
  if v_status = 'confirmed' then
    return;
  end if;
  if v_status <> 'active' then
    raise exception 'Reservation is not active';
  end if;

  update public.inventory_levels as level
  set on_hand = level.on_hand - item.quantity,
      reserved = level.reserved - item.quantity,
      updated_at = now()
  from public.inventory_reservation_items as item
  where item.reservation_id = p_reservation_id
    and level.id = item.inventory_level_id;

  update public.inventory_reservations
  set status = 'confirmed', confirmed_at = now(), updated_at = now()
  where id = p_reservation_id;
end;
$function$;

revoke all on function private.reserve_inventory(uuid, uuid, integer) from public, anon, authenticated;
revoke all on function private.release_reservation(uuid) from public, anon, authenticated;
revoke all on function private.confirm_reservation(uuid) from public, anon, authenticated;
grant execute on function private.reserve_inventory(uuid, uuid, integer) to service_role;
grant execute on function private.release_reservation(uuid) to service_role;
grant execute on function private.confirm_reservation(uuid) to service_role;

-- Every public table is RLS protected, even tables intended only for service code.
do $do$
declare
  v_table text;
begin
  foreach v_table in array array[
    'taxonomies', 'product_taxonomies', 'product_variants', 'product_media',
    'inventory_levels', 'inventory_reservations', 'inventory_reservation_items',
    'fulfilment_allocations', 'fulfilment_allocation_items', 'shipments', 'shipment_events',
    'customer_profiles', 'customer_children', 'customer_addresses', 'customer_consents',
    'wishlists', 'wishlist_items', 'product_reviews', 'review_media', 'review_votes',
    'reward_accounts', 'reward_ledger', 'referrals', 'gift_registries',
    'gift_registry_items', 'content_authors', 'content_posts',
    'content_post_taxonomies', 'content_post_products', 'promotions',
    'promotion_codes', 'promotion_products', 'applied_promotions',
    'delivery_zones', 'pickup_slots', 'payment_attempts', 'return_requests',
    'return_items', 'refunds', 'promotion_redemptions', 'product_comparisons',
    'recently_viewed_products', 'commerce_events', 'audit_logs'
  ]
  loop
    execute format('alter table public.%I enable row level security', v_table);
    execute format('revoke all on table public.%I from anon, authenticated', v_table);
    execute format('grant all on table public.%I to service_role', v_table);
  end loop;
end
$do$;

-- Public catalog and editorial reads. Inactive or draft records remain staff-only.
grant select on public.taxonomies, public.product_taxonomies, public.product_media,
  public.review_media, public.content_posts, public.content_post_taxonomies,
  public.content_post_products, public.promotion_products, public.delivery_zones
to anon, authenticated;
grant select (id, shop_id, starts_at, ends_at, is_active)
  on public.pickup_slots to anon, authenticated;
grant select (id, product_id, sku, title, option_values, price, compare_at_price,
  weight_grams, is_default, is_active, created_at, updated_at)
  on public.product_variants to anon, authenticated;
grant select (id, product_id, rating, title, body, status, is_verified_purchase,
  merchant_reply, published_at, created_at, updated_at)
  on public.product_reviews to anon, authenticated;
grant select (id, name, bio, avatar_url, is_active, created_at)
  on public.content_authors to anon, authenticated;
grant select (id, name, description, promotion_type, value, status, starts_at, ends_at,
  minimum_order_amount, stackable, automatic)
  on public.promotions to anon, authenticated;

drop policy if exists taxonomies_public_read on public.taxonomies;
create policy taxonomies_public_read on public.taxonomies for select to anon, authenticated
  using (is_active);
drop policy if exists product_taxonomies_public_read on public.product_taxonomies;
create policy product_taxonomies_public_read on public.product_taxonomies for select to anon, authenticated
  using (exists (select 1 from public.taxonomies t where t.id = taxonomy_id and t.is_active));
drop policy if exists product_variants_public_read on public.product_variants;
create policy product_variants_public_read on public.product_variants for select to anon, authenticated
  using (is_active and exists (select 1 from public.products p where p.id = product_id and p.is_active));
drop policy if exists product_media_public_read on public.product_media;
create policy product_media_public_read on public.product_media for select to anon, authenticated
  using (is_active and exists (select 1 from public.products p where p.id = product_id and p.is_active));
drop policy if exists inventory_levels_public_read on public.inventory_levels;
create policy inventory_levels_public_read on public.inventory_levels for select to anon, authenticated
  using (exists (
    select 1 from public.product_variants v join public.products p on p.id = v.product_id
    where v.id = variant_id and v.is_active and p.is_active
  ));
drop policy if exists product_reviews_public_read on public.product_reviews;
create policy product_reviews_public_read on public.product_reviews for select to anon, authenticated
  using (status = 'approved' and published_at is not null);
drop policy if exists review_media_public_read on public.review_media;
create policy review_media_public_read on public.review_media for select to anon, authenticated
  using (moderation_status = 'approved' and exists (
    select 1 from public.product_reviews r where r.id = review_id and r.status = 'approved'
  ));
drop policy if exists content_authors_public_read on public.content_authors;
create policy content_authors_public_read on public.content_authors for select to anon, authenticated
  using (is_active);
drop policy if exists content_posts_public_read on public.content_posts;
create policy content_posts_public_read on public.content_posts for select to anon, authenticated
  using (status = 'published' and published_at <= now());
drop policy if exists content_post_taxonomies_public_read on public.content_post_taxonomies;
create policy content_post_taxonomies_public_read on public.content_post_taxonomies for select to anon, authenticated
  using (exists (select 1 from public.content_posts p where p.id = post_id and p.status = 'published' and p.published_at <= now()));
drop policy if exists content_post_products_public_read on public.content_post_products;
create policy content_post_products_public_read on public.content_post_products for select to anon, authenticated
  using (exists (select 1 from public.content_posts p where p.id = post_id and p.status = 'published' and p.published_at <= now()));
drop policy if exists promotions_public_read on public.promotions;
create policy promotions_public_read on public.promotions for select to anon, authenticated
  using (status = 'active' and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at > now()));
drop policy if exists promotion_products_public_read on public.promotion_products;
create policy promotion_products_public_read on public.promotion_products for select to anon, authenticated
  using (exists (select 1 from public.promotions p where p.id = promotion_id and p.status = 'active'
    and (p.starts_at is null or p.starts_at <= now()) and (p.ends_at is null or p.ends_at > now())));

drop policy if exists delivery_zones_public_read on public.delivery_zones;
create policy delivery_zones_public_read on public.delivery_zones for select to anon, authenticated using (is_active);
drop policy if exists pickup_slots_public_read on public.pickup_slots;
create policy pickup_slots_public_read on public.pickup_slots for select to anon, authenticated
  using (is_active and starts_at > now());

-- Authenticated customers can manage only their own records. Append-only ledgers,
-- payment data, fulfilment data, and audit logs are never customer-writable.
grant all on public.customer_profiles, public.customer_children, public.customer_addresses,
  public.customer_consents, public.wishlists, public.wishlist_items,
  public.review_media, public.review_votes, public.referrals, public.gift_registries,
  public.gift_registry_items, public.product_comparisons, public.recently_viewed_products,
  public.return_requests, public.return_items
to authenticated;
revoke all on public.product_reviews from authenticated;
grant select (id, product_id, rating, title, body, status, is_verified_purchase,
  merchant_reply, published_at, created_at, updated_at)
  on public.product_reviews to authenticated;
grant insert (product_id, user_id, order_id, rating, title, body, status, is_verified_purchase)
  on public.product_reviews to authenticated;
grant update (rating, title, body, status)
  on public.product_reviews to authenticated;
grant select on public.reward_accounts, public.reward_ledger, public.inventory_reservations,
  public.inventory_reservation_items, public.fulfilment_allocations,
  public.fulfilment_allocation_items, public.shipments, public.shipment_events,
  public.payment_attempts, public.refunds, public.promotion_redemptions,
  public.applied_promotions
to authenticated;

drop policy if exists customer_profiles_owner on public.customer_profiles;
create policy customer_profiles_owner on public.customer_profiles for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists customer_children_owner on public.customer_children;
create policy customer_children_owner on public.customer_children for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists customer_addresses_owner on public.customer_addresses;
create policy customer_addresses_owner on public.customer_addresses for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists customer_consents_owner_read on public.customer_consents;
create policy customer_consents_owner_read on public.customer_consents for select to authenticated
  using ((select auth.uid()) = user_id);
drop policy if exists customer_consents_owner_insert on public.customer_consents;
create policy customer_consents_owner_insert on public.customer_consents for insert to authenticated
  with check ((select auth.uid()) = user_id);
drop policy if exists wishlists_owner on public.wishlists;
create policy wishlists_owner on public.wishlists for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists wishlist_items_owner on public.wishlist_items;
create policy wishlist_items_owner on public.wishlist_items for all to authenticated
  using (exists (select 1 from public.wishlists w where w.id = wishlist_id and w.user_id = (select auth.uid())))
  with check (exists (select 1 from public.wishlists w where w.id = wishlist_id and w.user_id = (select auth.uid())));
drop policy if exists product_reviews_owner_insert on public.product_reviews;
create policy product_reviews_owner_insert on public.product_reviews for insert to authenticated
  with check ((select auth.uid()) = user_id and status = 'pending' and not is_verified_purchase);
drop policy if exists product_reviews_owner_read on public.product_reviews;
create policy product_reviews_owner_read on public.product_reviews for select to authenticated
  using ((select auth.uid()) = user_id);
drop policy if exists product_reviews_owner_update on public.product_reviews;
create policy product_reviews_owner_update on public.product_reviews for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id and status = 'pending' and not is_verified_purchase);
drop policy if exists review_media_owner on public.review_media;
create policy review_media_owner on public.review_media for all to authenticated
  using (exists (select 1 from public.product_reviews r where r.id = review_id and r.user_id = (select auth.uid())))
  with check (exists (select 1 from public.product_reviews r where r.id = review_id and r.user_id = (select auth.uid())));
drop policy if exists review_votes_owner on public.review_votes;
create policy review_votes_owner on public.review_votes for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists reward_accounts_owner_read on public.reward_accounts;
create policy reward_accounts_owner_read on public.reward_accounts for select to authenticated
  using ((select auth.uid()) = user_id);
drop policy if exists reward_ledger_owner_read on public.reward_ledger;
create policy reward_ledger_owner_read on public.reward_ledger for select to authenticated
  using ((select auth.uid()) = user_id);
drop policy if exists referrals_owner_read on public.referrals;
create policy referrals_owner_read on public.referrals for select to authenticated
  using ((select auth.uid()) in (referrer_user_id, referred_user_id));
drop policy if exists referrals_owner_insert on public.referrals;
create policy referrals_owner_insert on public.referrals for insert to authenticated
  with check ((select auth.uid()) = referrer_user_id and referred_user_id is null and status = 'invited');
drop policy if exists gift_registries_owner on public.gift_registries;
create policy gift_registries_owner on public.gift_registries for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists gift_registry_items_owner on public.gift_registry_items;
create policy gift_registry_items_owner on public.gift_registry_items for all to authenticated
  using (exists (select 1 from public.gift_registries r where r.id = registry_id and r.user_id = (select auth.uid())))
  with check (exists (select 1 from public.gift_registries r where r.id = registry_id and r.user_id = (select auth.uid())));
drop policy if exists product_comparisons_owner on public.product_comparisons;
create policy product_comparisons_owner on public.product_comparisons for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists recently_viewed_owner on public.recently_viewed_products;
create policy recently_viewed_owner on public.recently_viewed_products for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists return_requests_owner_read on public.return_requests;
create policy return_requests_owner_read on public.return_requests for select to authenticated
  using ((select auth.uid()) = user_id);
drop policy if exists return_requests_owner_insert on public.return_requests;
create policy return_requests_owner_insert on public.return_requests for insert to authenticated
  with check ((select auth.uid()) = user_id and status = 'requested');
drop policy if exists return_items_owner on public.return_items;
create policy return_items_owner on public.return_items for all to authenticated
  using (exists (select 1 from public.return_requests r where r.id = return_id and r.user_id = (select auth.uid())))
  with check (exists (select 1 from public.return_requests r where r.id = return_id and r.user_id = (select auth.uid())));
drop policy if exists inventory_reservations_owner_read on public.inventory_reservations;
create policy inventory_reservations_owner_read on public.inventory_reservations for select to authenticated
  using ((select auth.uid()) = user_id);
drop policy if exists reservation_items_owner_read on public.inventory_reservation_items;
create policy reservation_items_owner_read on public.inventory_reservation_items for select to authenticated
  using (exists (select 1 from public.inventory_reservations r where r.id = reservation_id and r.user_id = (select auth.uid())));

-- Staff roles live in protected app_metadata. Legacy boss records are accepted by
-- private.has_staff_role solely as a migration bridge.
do $do$
declare
  v_table text;
begin
  foreach v_table in array array[
    'taxonomies', 'product_taxonomies', 'product_variants', 'product_media',
    'inventory_levels', 'inventory_reservations', 'inventory_reservation_items',
    'fulfilment_allocations', 'fulfilment_allocation_items', 'shipments', 'shipment_events',
    'customer_profiles', 'customer_children', 'customer_addresses', 'customer_consents',
    'wishlists', 'wishlist_items', 'product_reviews', 'review_media', 'review_votes',
    'reward_accounts', 'reward_ledger', 'referrals', 'gift_registries', 'gift_registry_items',
    'content_authors', 'content_posts', 'content_post_taxonomies', 'content_post_products',
    'promotions', 'promotion_codes', 'promotion_products', 'applied_promotions',
    'delivery_zones', 'pickup_slots', 'payment_attempts', 'return_requests', 'return_items',
    'refunds', 'promotion_redemptions', 'product_comparisons', 'recently_viewed_products',
    'commerce_events', 'audit_logs'
  ]
  loop
    execute format('drop policy if exists staff_manage on public.%I', v_table);
    execute format(
      'create policy staff_manage on public.%I for all to authenticated using (private.has_staff_role(ARRAY[''owner'',''manager''])) with check (private.has_staff_role(ARRAY[''owner'',''manager'']))',
      v_table
    );
  end loop;
end
$do$;

-- These grants must remain last: the RLS bootstrap above revokes table access
-- before rebuilding the deliberately small Data API surface.
grant select on public.orders, public.order_items to authenticated;
grant insert on public.commerce_events to anon, authenticated;
grant usage, select on sequence public.commerce_events_id_seq to anon, authenticated;
revoke all on public.return_items from authenticated;
grant select, insert, delete on public.return_items to authenticated;
grant all on all sequences in schema public to service_role;

-- Column ownership corrections after customer-wide grants above.
revoke all on public.review_media from authenticated;
grant select on public.review_media to authenticated;
grant insert (review_id, media_type, url) on public.review_media to authenticated;
grant update (media_type, url) on public.review_media to authenticated;
grant delete on public.review_media to authenticated;
revoke all on public.gift_registry_items from authenticated;
grant select on public.gift_registry_items to authenticated;
grant insert (registry_id, product_id, variant_id, requested_quantity, priority)
  on public.gift_registry_items to authenticated;
grant update (requested_quantity, priority) on public.gift_registry_items to authenticated;
grant delete on public.gift_registry_items to authenticated;
