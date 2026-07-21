# Production setup

## Required Supabase step

Apply `supabase/migrations/20260721_production_security.sql` in the Supabase SQL editor before enabling production checkout. It:

- Enables row-level security on business tables.
- Restricts orders, members, staff, and completed records to authorized users.
- Adds the transactional `finalize_paid_order` function.
- Adds the `register_member` function for safe public membership registration.

Then seed the authorized accounts using the SQL editor:

```sql
insert into public.admin_users (email, full_name, role, is_active)
values ('admin@example.com', 'Baebe Boo Admin', 'boss', true)
on conflict (email) do update set role = 'boss', is_active = true;

insert into public.staff_authorizations (email, staff_id)
values ('counter@example.com', 'STAFF_UUID')
on conflict (email) do update set active = true;
```

Set the Paystack webhook URL to:

```text
https://baebe-boo.jtechinnovations.tech/api/paystack/webhook
```

## Required server environment

```text
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=
PAYSTACK_SECRET_KEY=
```

Keep the server environment file at mode `600`. Never use `SUPABASE_SECRET_KEY` in a `NEXT_PUBLIC_*` variable.

## Deployment verification

Run:

```bash
npm ci
npm run build
pm2 startOrRestart ecosystem.config.cjs --update-env
pm2 save
```

The payment verification route intentionally depends on `finalize_paid_order`; this prevents paid orders from bypassing the stock transaction if the database security migration has not been applied.
