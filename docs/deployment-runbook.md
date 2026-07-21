# Deployment runbook

## Phase 1 — staging rehearsal

1. Create isolated staging Supabase and Paystack test-mode projects.
2. Apply `supabase/migrations/20260721_z_commerce_foundation.sql`, then run
   `supabase/tests/commerce_foundation.sql` with `psql` and stop on any error.
3. Configure every value from `.env.production.example` in the staging host.
4. Deploy the candidate and run the full quality gate from the README.
5. Exercise guest and signed-in checkout, split delivery, click-and-collect,
   payment cancellation, webhook replay, counter sale, stock reconciliation,
   order transitions, returns, rewards, and admin authorization.
6. Confirm analytics only loads after consent and that no secrets appear in the
   browser bundle or logs.

## Phase 2 — production readiness

- Select an operations tier that provides daily database backups, restore tests,
  firewall/WAF and bot controls, alerting, logs, and an incident owner. This is a
  business decision and is the only intentional go-live gate in this repository.
- Create production Supabase and Paystack live-mode credentials; never reuse
  staging credentials.
- Configure Paystack's webhook as
  `https://baebe-boo.jtechinnovations.tech/api/paystack/webhook`.
- Configure the Supabase Site URL and allowed redirect URLs for the production
  hostname and `/auth/callback`.
- Confirm SPF, DKIM, and DMARC for the transactional email sender.
- Validate inventory and prices against the physical branches and perform a
  signed reconciliation.
- Create the first administrator and counter staff through an audited, manual
  database operation; require MFA at the identity-provider level until the
  in-app enrollment policy is enabled.

## Phase 3 — cutover

1. Freeze catalog and inventory edits during the final migration window.
2. Take and verify a pre-cutover backup.
3. Apply the tested migration and import the reconciled production catalog.
4. Deploy the exact staging-approved revision.
5. Point the DNS record for `baebe-boo.jtechinnovations.tech` to the host, enable
   TLS, and confirm the canonical URL, sitemap, robots, and security headers.
6. Run one low-value live Mobile Money transaction and one card transaction;
   refund both and reconcile Paystack, order, reservation, and inventory records.
7. Remove the catalog freeze only after monitoring is green.

## Rollback

- Roll application traffic back to the previous immutable deployment.
- Do not reverse a database migration after orders exist. Disable checkout,
  preserve evidence, and use a forward repair migration.
- Release only expired/unpaid reservations. Never restore stock for a captured
  payment without an audited reconciliation.
- Rotate any credential suspected of disclosure, then invalidate sessions.

## Daily operations

- Review failed payments, fulfilment exceptions, oversell warnings, inventory
  drift, authentication anomalies, and webhook failures.
- Verify backup completion daily and perform a documented restore drill monthly.
- Reconcile counter and online orders with Paystack and branch closing stock.
- Review audit logs before changing staff roles, promotions, prices, or branches.
