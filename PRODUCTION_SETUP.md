# Production setup

## Required Supabase step

Apply `supabase/migrations/20260721_production_security.sql` in the Supabase SQL editor before enabling production checkout. It:

- Enables row-level security on business tables.
- Restricts orders, members, staff, and completed records to authorized users.
- Adds the transactional `finalize_paid_order` function.
- Adds the `register_member` function for safe public membership registration.

Create the password accounts in Supabase Authentication first. Admin usernames are
accepted as either an email address or a short username. A short admin username is
stored as `<username>@admin.baebe-boo.local`. CounterIDs use the same convention:
`<counterid>@counter.baebe-boo.local`.

Then seed the authorization records using the SQL editor:

```sql
insert into public.admin_users (email, full_name, role, is_active)
values ('admin@admin.baebe-boo.local', 'Baebe Boo Admin', 'boss', true);

insert into public.staff_authorizations (email, staff_id)
values ('counter01@counter.baebe-boo.local', 'STAFF_UUID')
on conflict (email) do update set staff_id = excluded.staff_id, active = true;
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
