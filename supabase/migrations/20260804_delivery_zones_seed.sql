-- Starter delivery zones.
--
-- `delivery_zones` was created by 20260721_z_commerce_foundation.sql but never
-- populated by anything — no seed script, no insert, and no admin screen. The
-- storefront checkout gates its delivery option on there being at least one
-- active zone (CheckoutPage `canRequestQuote`), so an empty table presents a
-- "Delivery zone" dropdown with no choices and no way to pay. Click-and-collect
-- was unaffected because `shops` had rows.
--
-- These are starting values agreed with the business, not fixed truth. They are
-- editable from BaebeAdmin -> Delivery; this file only covers a fresh database.

insert into public.delivery_zones (
  name, regions, base_fee, free_delivery_threshold,
  estimated_days_min, estimated_days_max, is_active
)
select
  seed.name, seed.regions, seed.base_fee, seed.free_delivery_threshold,
  seed.estimated_days_min, seed.estimated_days_max, true
from (
  values
    ('Accra Central', '["Greater Accra"]'::jsonb, 25.00, 500.00, 1, 2),
    ('Greater Accra', '["Greater Accra"]'::jsonb, 40.00, 500.00, 2, 3),
    ('Kumasi',        '["Ashanti"]'::jsonb,       60.00, 500.00, 3, 4),
    ('Other regions', '[]'::jsonb,                80.00, 500.00, 4, 6)
) as seed(
  name, regions, base_fee, free_delivery_threshold,
  estimated_days_min, estimated_days_max
)
-- Seeds only a genuinely empty table, so re-running never duplicates a zone
-- and never overwrites fees the business has since edited.
where not exists (select 1 from public.delivery_zones);
