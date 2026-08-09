-- Legacy base schema, reconstructed.
--
-- The tables below predate this repository and were only ever `alter table`d by
-- the migrations, never created. That made the migration set unrunnable against
-- an empty database: `20260721_production_security.sql` immediately does
-- `alter table public.products enable row level security` on a table that does
-- not exist, so a fresh Supabase preview branch cannot be built from the repo
-- at all.
--
-- Reconstructed by introspecting the production PostgREST schema, so it carries
-- column names, types, NOT NULL and key relationships faithfully. It does NOT
-- carry CHECK constraints, exact server defaults, or unique indexes beyond the
-- primary keys - PostgREST does not expose those. Defaults below follow the
-- conventions used everywhere else in this schema.
--
-- Good enough to stand up a branch for testing. NOT a faithful replica: never
-- apply this to the production database, where every one of these tables
-- already exists.
--
-- Runs first by filename order, before 20260721_production_security.sql.

create table if not exists public.admin_users (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  full_name text,
  role text not null,
  is_active boolean default true,
  created_at timestamptz default now()
);

create table if not exists public.members (
  id uuid primary key default gen_random_uuid(),
  parent_name text not null,
  child_first_name text not null,
  child_last_name text not null,
  phone text not null,
  email text not null,
  child_date_of_birth date not null,
  created_at timestamptz default now(),
  member_code text,
  child_dob date
);

create table if not exists public.shops (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  location text not null,
  database_name text not null,
  is_active boolean default true,
  created_at timestamptz default now()
);

create table if not exists public.shop_staff (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid,
  staff_name text not null,
  staff_contact text not null,
  profile_image_url text,
  created_at timestamptz default now(),
  staff_code text,
  is_active boolean default true not null,
  auth_user_id uuid
);

do $$ begin
  alter table public.shop_staff
    add constraint shop_staff_shop_id_fkey foreign key (shop_id)
    references public.shops(id) on delete set null;
exception when duplicate_object then null; end $$;

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  category text not null,
  age_range text,
  gender text,
  sku text,
  price numeric not null,
  image_url text,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.product_shop_availability (
  id uuid primary key default gen_random_uuid(),
  product_id uuid,
  shop_id uuid,
  stock_quantity integer,
  is_available boolean default true,
  created_at timestamptz default now()
);

do $$ begin
  alter table public.product_shop_availability
    add constraint product_shop_availability_product_id_fkey foreign key (product_id)
    references public.products(id) on delete set null;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.product_shop_availability
    add constraint product_shop_availability_shop_id_fkey foreign key (shop_id)
    references public.shops(id) on delete set null;
exception when duplicate_object then null; end $$;

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null,
  customer_name text not null,
  customer_email text,
  customer_phone text not null,
  delivery_address text not null,
  shop_id uuid,
  total_amount numeric not null,
  payment_method text not null,
  payment_status text not null,
  payment_reference text,
  payment_date timestamptz,
  order_status text not null,
  order_type text not null,
  notes text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  customer_user_id uuid,
  staff_id uuid,
  voucher_code text,
  voucher_credit numeric,
  idempotency_key text
);

do $$ begin
  alter table public.orders
    add constraint orders_shop_id_fkey foreign key (shop_id)
    references public.shops(id) on delete set null;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.orders
    add constraint orders_staff_id_fkey foreign key (staff_id)
    references public.shop_staff(id) on delete set null;
exception when duplicate_object then null; end $$;

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null,
  product_id uuid,
  product_name text not null,
  quantity integer not null,
  unit_price numeric not null,
  total_price numeric not null,
  created_at timestamptz default now(),
  subtotal numeric,
  shop_id uuid,
  sku text,
  price numeric,
  product_image_url text,
  category text,
  variant_id uuid,
  cost_price numeric
);

do $$ begin
  alter table public.order_items
    add constraint order_items_product_id_fkey foreign key (product_id)
    references public.products(id) on delete set null;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.order_items
    add constraint order_items_shop_id_fkey foreign key (shop_id)
    references public.shops(id) on delete set null;
exception when duplicate_object then null; end $$;

create table if not exists public.completed_orders (
  id uuid primary key default gen_random_uuid(),
  original_order_id uuid,
  order_number text,
  customer_name text,
  customer_code text,
  order_type text,
  total_amount numeric,
  completed_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists public.completed_order_items (
  id uuid primary key default gen_random_uuid(),
  completed_order_id uuid,
  original_order_item_id uuid,
  product_id uuid,
  product_name text,
  product_image_url text,
  category text,
  quantity integer,
  price numeric,
  created_at timestamptz default now(),
  sku text
);

do $$ begin
  alter table public.completed_order_items
    add constraint completed_order_items_completed_order_id_fkey foreign key (completed_order_id)
    references public.completed_orders(id) on delete set null;
exception when duplicate_object then null; end $$;

