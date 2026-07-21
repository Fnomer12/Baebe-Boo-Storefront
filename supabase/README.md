# Supabase schema workflow

This repository uses imperative, hand-authored migrations. The legacy production
schema is remote-only; `20260721_production_security.sql` is its compatibility
security layer, and `20260721_z_commerce_foundation.sql` is additive.

## Apply safely

1. Back up the database and rehearse on an isolated Supabase staging project.
2. Confirm the staging legacy schema contains the tables referenced by the first
   security migration (`products`, `shops`, `orders`, staff, member, completed-order,
   and availability tables).
3. Apply migrations in filename order. Do not apply the commerce migration before
   the production security migration.
4. Run `supabase/tests/commerce_foundation.sql`, database advisors, and the checkout
   concurrency tests before promoting the migration.
5. Regenerate application database types from the migrated staging project.

The commerce migration backfills one default variant for each legacy product and
copies legacy branch quantities into `inventory_levels`. It does not delete or
rename legacy data. During the transition, payment finalization updates both the
normalized reservation and legacy availability models atomically.

## Server-only RPCs

- `reserve_checkout(jsonb, uuid, uuid, text, timestamptz)` locks a whole cart in a
  deterministic order and returns the reservation UUID.
- `release_checkout_reservation(uuid)` releases an active reservation.
- `finalize_checkout_reservation(uuid, uuid)` confirms normalized inventory,
  synchronizes legacy branch availability per allocation, and marks payment in
  one split-fulfilment-safe transaction.
- `transition_order(uuid, text)` enforces the order state machine and audit trail.
- `complete_counter_sale(uuid, jsonb, text, text, text)` completes a branch sale.
- `join_family(text, text, text, text, text, date, text, text)` deduplicates family
  enrollment and records email/WhatsApp consent.
- `record_order_promotion_redemptions(uuid)` idempotently records promotions after
  verified payment and increments promotion-code usage exactly once per order.

All checkout/family RPCs are executable only by `service_role`. Never expose that
credential to a browser. `transition_order` and `complete_counter_sale` additionally
accept authenticated staff after checking protected authorization data.

## Known deployment risks

- The local repository has no Supabase CLI or schema dump, so SQL must be rehearsed
  against a clone of the remote legacy schema before production.
- The completed-order snapshot functions rely on the legacy columns currently read
  by the admin UI. Confirm their constraints in staging.
- Staff authorization accepts legacy `admin_users` boss records temporarily; move
  every staff role to `app_metadata.staff_role`, then remove that bridge later.
- Promotion calculation is server-owned and the database stores the applied snapshot.
  Reward posting remains a server-domain responsibility.
- Promotion usage limits are checked at quote and initialization time. There is a
  narrow concurrency window before Paystack capture; a captured order is honored
  and recorded rather than stranded. A future promotion-hold model can close it.
