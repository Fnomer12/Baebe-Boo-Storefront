-- WooCommerce-style variable products.
--
-- Variants already exist (`product_variants.option_values`, jsonb, shaped
-- `{"color":"Pink","size":"3M"}`). What does not exist is the product's own
-- ATTRIBUTE list — the "Colour: Pink, Blue" a seller declares before any
-- variant is generated. Without it the editor can only infer options from the
-- variants that happen to exist, so a seller cannot add a colour they have not
-- built yet, and a product whose variants are all switched off reads as simple.
--
-- WHY AN ARRAY AND NOT AN OBJECT
--   `[{"name":"Colour","values":["Pink","Blue"]}, {"name":"Size", …}]`
--
-- Postgres stores jsonb object keys sorted by (length, bytes). So
-- `{"color": …, "size": …}` reads back with `size` FIRST, and every picker on
-- the page renders in the wrong order — "3M · Pink" rather than "Pink · 3M".
-- That bug already shipped once in the till and had to be undone in
-- application code (src/domain/counter/grouping.ts, OPTION_ORDER). An array
-- preserves the seller's order, so it does not have to be guessed back.
--
-- WHY NO `product_type` COLUMN
-- A product is variable when `jsonb_array_length(options) > 0`. A second
-- column that says the same thing is a second column that can disagree.
--
--
-- PRE-FLIGHT CHECK BEFORE APPLYING — read this, it is not optional
-- ----------------------------------------------------------------
-- Confirm `public.products` has TABLE-level select granted to anon, not
-- column-level. Postgres does NOT extend column-level grants to columns added
-- later, so if the grant is per-column the storefront would read every product
-- with `options` missing — silently, with no error, and every variable product
-- would render as simple. `product_variants` IS granted per column
-- (20260721_z_commerce_foundation.sql:1540, deliberately, to keep cost_price
-- and barcode away from anon), so this is a live pattern in this database.
--
--   select grantee, privilege_type
--     from information_schema.table_privileges
--    where table_schema = 'public' and table_name = 'products';
--
--   select grantee, column_name
--     from information_schema.column_privileges
--    where table_schema = 'public' and table_name = 'products'
--      and grantee in ('anon', 'authenticated');
--
-- If the second query returns rows, add `options` to the column grant:
--   grant select (options) on public.products to anon, authenticated;

alter table public.products
  add column if not exists options jsonb not null default '[]'::jsonb;

comment on column public.products.options is
  'Attribute definitions, ordered: [{"name":"Colour","values":["Pink","Blue"]}]. An array because jsonb re-sorts object keys and every picker would render in the wrong order. Max 3 entries; variant option_values keys are the lowercased names.';

-- The shape check is deliberately shallow: it holds the array-ness and the cap
-- that the UI depends on, and leaves the per-entry rules to zod
-- (src/lib/admin/catalog-schemas.ts), which can say WHICH field is wrong.
alter table public.products
  drop constraint if exists products_options_shape;
alter table public.products
  add constraint products_options_shape check (
    jsonb_typeof(options) = 'array' and jsonb_array_length(options) <= 3
  );

-- Variant-specific imagery: the gallery filters by variant_id on every product
-- page, and this table is otherwise only indexed by (product_id, sort_order).
create index if not exists product_media_variant_idx
  on public.product_media(variant_id)
  where variant_id is not null;

-- BACKFILL (a): give the products that already have structured options their
-- attribute list.
--
-- This is the important half. Without it, the ten seeded products open in the
-- new editor as SIMPLE products, and the first save reconciles their real
-- variants against an empty option list — switching every one of them off.
-- Those rows cannot be deleted (purchase order lines are ON DELETE RESTRICT)
-- and their stock would have to be re-counted by hand.
--
-- Names come from the jsonb keys themselves, capitalised, so that
-- `optionKey(name)` still finds the key it was derived from. Colour leads,
-- then size, then anything else alphabetically — the same ranking the
-- application uses, so a product looks the same before and after this runs.
with variant_options as (
  select
    v.product_id,
    lower(trim(o.key)) as option_key,
    trim(o.value #>> '{}') as option_value,
    min(v.created_at) as first_seen
  from public.product_variants v
  -- The type guard lives INSIDE the lateral, not in WHERE: jsonb_each raises
  -- "cannot deconstruct a scalar" on a legacy row holding a bare string, and
  -- WHERE is not guaranteed to filter it out first.
  cross join lateral jsonb_each(
    case
      when jsonb_typeof(coalesce(v.option_values, '{}'::jsonb)) = 'object'
      then coalesce(v.option_values, '{}'::jsonb)
      else '{}'::jsonb
    end
  ) as o(key, value)
  where v.is_active
    and jsonb_typeof(o.value) = 'string'
    and coalesce(trim(o.value #>> '{}'), '') <> ''
    and coalesce(trim(o.key), '') <> ''
  group by 1, 2, 3
),
ranked as (
  select
    product_id,
    option_key,
    case
      when option_key in ('color', 'colour') then 0
      when option_key = 'size' then 1
      when option_key = 'material' then 2
      else 3
    end as option_rank,
    -- Not aliased `values`: that is a reserved word in Postgres.
    array_agg(option_value order by first_seen, option_value) as value_list
  from variant_options
  group by 1, 2
),
collected as (
  select
    product_id,
    jsonb_agg(
      jsonb_build_object('name', initcap(option_key), 'values', to_jsonb(value_list))
      order by option_rank, option_key
    ) as options
  from ranked
  group by product_id
  having count(*) <= 3
)
update public.products p
   set options = c.options
  from collected c
 where p.id = c.product_id
   -- Never overwrite a list a human has already curated.
   and coalesce(jsonb_array_length(p.options), 0) = 0;

-- BACKFILL (b): `products.price` is what the listing grid and every legacy
-- query read. On a variable product it should be the "from" price, not
-- whatever the first variant happened to cost when the row was created.
update public.products p
   set price = v.min_price
  from (
    select product_id, min(price) as min_price
      from public.product_variants
     where is_active
     group by product_id
  ) v
 where p.id = v.product_id
   and v.min_price is not null
   and p.price is distinct from v.min_price;
