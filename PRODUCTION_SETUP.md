# Production setup

## Required Supabase step

Apply `supabase/migrations/20260721_production_security.sql` in the Supabase SQL editor before enabling production checkout. It:

- Enables row-level security on business tables.
- Restricts orders, members, staff, and completed records to authorized users.
- Adds the transactional `finalize_paid_order` function.
- Adds the `register_member` function for safe public membership registration.

### Admin accounts

Create the password account in Supabase Authentication first. Admin usernames are
accepted as either an email address or a short username; a short username is
stored as `<username>@admin.baebe-boo.local`. Then seed the authorization record:

```sql
insert into public.admin_users (email, full_name, role, is_active)
values ('admin@admin.baebe-boo.local', 'Baebe Boo Admin', 'boss', true);
```

### Counter (till) accounts

Do **not** create these by hand. Add counter staff from **Admin → Stores → Add
staff**. Saving provisions the whole chain in one step:

- a `shop_staff` row with a generated CounterID,
- the Supabase Auth user at `<counterid>@counter.baebe-boo.local`,
- the matching `staff_authorizations` row.

The sign-in address is *derived* from the CounterID and is never typed. That
address is what `is_authorized_counter()` compares against, so a hand-entered
one silently locks the cashier out.

The one-time password is displayed once and is never stored — write it down or
hand it over there and then. If it is lost, use **Reset password** on the staff
member; the same action creates the login for staff records that predate this
flow ("Login missing").

**Revoke access** is a soft revoke: it clears `staff_authorizations.active`,
which takes effect on the cashier's very next request, while leaving past sales
attributed to them. Requires `supabase/migrations/20260728_shop_staff_auth_user.sql`.

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
EMAIL_PROVIDER=resend
RESEND_API_KEY=
EMAIL_FROM=Baebe Boo <no-reply@jtechinnovations.tech>
EMAIL_REPLY_TO=
SUPPORT_EMAIL=
SUPPORT_WHATSAPP_NUMBER=
```

Keep the server environment file at mode `600`. Never use `SUPABASE_SECRET_KEY` in a `NEXT_PUBLIC_*` variable.

The first three email variables are **required**, not optional. Without them
`sendEmail` falls back to simulating every send, and customer sign-in returns
`503 Sign-in by email is temporarily unavailable` — the code flow refuses to tell
anyone to check an inbox that will receive nothing. `EMAIL_FROM` must be on a
domain verified at resend.com/domains.

`EMAIL_REPLY_TO`, `SUPPORT_EMAIL` and `SUPPORT_WHATSAPP_NUMBER` are optional and
all three degrade quietly when unset — receipts simply stop offering a contact
route rather than printing one that does not work. `EMAIL_REPLY_TO` is worth
setting: everything is sent from `no-reply@`, so until it exists a customer who
replies to their receipt is talking to nobody. Unlike `EMAIL_FROM` it does
**not** need a Resend-verified domain, only a mailbox somebody reads.

## Receipt PDFs

Every paid order gets a PDF receipt attached to its confirmation email, and the
same document is downloadable from `/receipt/pdf` and
`/account/orders/[orderNumber]/receipt/pdf`. Nothing is stored — each is
rendered on demand, so there is no bucket to configure and no copy of a
customer's address sitting in object storage.

Two files must survive deployment or receipts break:

- `src/lib/pdf/fonts/PlusJakartaSans-{Regular,Bold}.ttf` — the cedi sign (₵,
  U+20B5) is absent from PDFKit's built-in fonts, so without these the amount
  paid renders as a blank. Generation refuses rather than printing money with a
  hole in it. Both are SIL Open Font License 1.1; `OFL.txt` ships beside them.
- `public/brand/baebe-boo-logo.jpg` — decoration; a missing logo just leaves a
  wordmark-only header.

Both are read relative to `process.cwd()`, which pm2 pins in
`ecosystem.config.cjs`. If this app ever adopts `output: "standalone"`, `src/`
stops being copied and the fonts must move under `public/`.

Note that Next loads `.env.local` **before** `.env.production`, so any key present
in `.env.local` wins in production. Keep deployment values out of `.env.local`.

## Customer sign-in

Customers sign in with a 6-digit code emailed through Resend
(`POST /api/auth/login-code` then `/api/auth/login-code/verify`). It requires
`supabase/migrations/20260805_customer_login_codes.sql`, which creates
`login_codes` plus the `issue_login_code`, `consume_login_code` and
`is_staff_login_email` functions.

`is_staff_login_email` is a security control, not a convenience: `is_admin()` and
`private.has_staff_role()` both grant owner rights to any session whose JWT email
matches an active `admin_users` row, so without it a customer code sent to a
staff member's ordinary mailbox would mint an admin-privileged session that
bypasses the admin portal and its MFA. Do not weaken it to a domain-suffix check.

`/auth/callback` stays in place only to land magic links issued before the switch,
and can be deleted once those have expired.

## Deployment verification

Run:

```bash
npm ci
npm run build
pm2 startOrRestart ecosystem.config.cjs --update-env
pm2 save
```

The payment verification route intentionally depends on `finalize_paid_order`; this prevents paid orders from bypassing the stock transaction if the database security migration has not been applied.
