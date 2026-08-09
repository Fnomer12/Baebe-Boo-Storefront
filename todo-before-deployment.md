# TODO before deploying to Vercel

A checklist for taking this build live on Vercel. Work through it top to bottom;
nothing here is optional unless marked so. When every box is ticked, run the
verification pass at the bottom.

> Current state: the app runs in production on a VPS (pm2 + nginx — see
> `deploy/`; you can ignore that folder for Vercel). The Supabase database is
> live and fully migrated — **do not run any SQL migrations**. All features were
> E2E-tested on 2026-08-09.

---

## 1. Environment variables (Vercel → Project → Settings → Environment Variables)

Copy the keys below from `.env.production.example` and fill them with the real
values (ask the project owner for the secrets — they are NOT in the repo):

| Key | Notes |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | The live Supabase project URL. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable (anon) key. |
| `SUPABASE_SECRET_KEY` | Service-role key. Server-only — never expose. |
| `NEXT_PUBLIC_SITE_URL` | The FINAL public domain, e.g. `https://baebeboo.com`. See section 2 — this one is load-bearing. |
| `PAYSTACK_SECRET_KEY` | **LIVE** key (`sk_live_…`). See section 3. |
| `ADMIN_EMAILS` | Comma-separated admin mailboxes. |
| `EMAIL_PROVIDER` / `RESEND_API_KEY` / `EMAIL_FROM` | Resend transactional email. Without these, `sendEmail` silently simulates and the customer sign-in code flow returns 503. |
| `SUPPORT_EMAIL` (optional) | Shown on receipts as the reply address. |
| `CRON_SECRET` | Must match the `baebe_boo_cron_secret` stored in Supabase Vault. |
| `NEXT_PUBLIC_WHATSAPP_NUMBER` | See section 4. Digits only, e.g. `233544239772`. |

- [ ] All variables set for the **Production** environment in Vercel.
- [ ] `NEXT_PUBLIC_*` values double-checked — they are inlined at **build time**,
      so changing one later requires a redeploy.

## 2. `NEXT_PUBLIC_SITE_URL` and the domain (critical)

This variable is not just cosmetic. It drives:

1. The CSRF origin-check backstop for every customer account API.
2. Links inside transactional emails, `sitemap.xml`, `robots.txt`.
3. **Staff sign-in**: admin and cashier accounts are Supabase users with
   addresses derived from the site host — `admin.<host>` and `counter.<host>`.
   If the public domain changes, existing staff logins keep their OLD addresses
   and must be migrated with `node scripts/backfill-staff-login-domain.mjs`
   (read its header first). If you keep the current domain, nothing to do.
4. The campaign cron job: Supabase `pg_cron` calls
   `GET https://<site>/api/cron/campaigns` using the `baebe_boo_site_url`
   secret stored in **Supabase Vault**. If the domain changes, update that
   Vault secret too (see comments at the end of
   `supabase/migrations/20260807_customer_merge_and_schedule.sql`).

- [ ] `NEXT_PUBLIC_SITE_URL` set to the final domain (no trailing slash).
- [ ] If the domain differs from `baebe-boo.jtechinnovations.tech`: staff login
      backfill run **and** the Vault `baebe_boo_site_url` secret updated.

## 3. Paystack — switch to live keys

- [ ] Set `PAYSTACK_SECRET_KEY` to the **live** secret key (`sk_live_…`).
      The browser popup uses server-issued access codes, so there is no
      public-key env to set.
- [ ] In the Paystack dashboard, set the **webhook URL** to
      `https://<final-domain>/api/paystack/webhook` (live mode). The webhook is
      what finalizes an order if the customer closes the tab after paying —
      payments will appear stuck without it.
- [ ] Make one small **real** purchase after go-live: pay, land on
      `/checkout/success`, receive the confirmation email, and see the order
      under BaebeAdmin → Orders. Refund it from Paystack afterwards if needed.

## 3b. Resend — verify the sending domain

Transactional email (sign-in codes, order receipts) goes through Resend, and
Resend only sends from **verified domains**. The currently verified domain is
`jtechinnovations.tech`.

- [ ] If the final site domain is different, add and verify it in the Resend
      dashboard (DNS records) and update `EMAIL_FROM` to an address on that
      domain (e.g. `Baebe Boo <orders@<final-domain>>`).
- [ ] Confirm `RESEND_API_KEY` belongs to the Resend account that owns the
      verified domain — a key from another account/team will not send.
- [ ] Beware the silent failure mode: with missing/wrong email config,
      `sendEmail` **simulates** instead of sending — customers simply never get
      their sign-in code. The post-deploy check in section 8 (email code
      arrives) is the real test.

## 4. WhatsApp number

- [ ] Confirm the business WhatsApp number with the owner and set
      `NEXT_PUBLIC_WHATSAPP_NUMBER` (country code + number, digits only —
      currently `233544239772`). This powers the floating chat button, footer,
      mobile menu, homepage tile, and product-page "Ask about this product".
- [ ] Per-branch numbers: BaebeAdmin → Stores → edit each store → "WhatsApp
      number". These show on `/stores`; blank falls back to the global number.

## 5. Maps and store locations

The `/stores` page shows an OpenStreetMap embed plus a "Directions" button per
store that searches Google Maps for the store's `location` text.

- [ ] The map iframe in `src/app/stores/page.tsx` currently frames **all of
      Ghana** (`bbox=-3.6,4.5,1.5,11.2`). Tighten the bbox to the area where
      the stores actually are (get the real coordinates from the owner).
- [ ] In BaebeAdmin → Stores, make sure each store's **Location** field is a
      real, findable address (test each "Directions" button on `/stores` —
      it must land on the correct place in Google Maps).
- [ ] Store opening hours are currently hardcoded as "Confirm today's hours
      with the store" (`src/app/stores/page.tsx`). Replace with real hours if
      the owner provides them.

## 6. Verify frontend information (content pass)

Read every public page as a customer and confirm the facts with the owner:

- [ ] **Footer** (`src/components/Footer.tsx`): email link is
      `hello@baebe-boo.com` and Instagram is `@baebeboo` — confirm both exist,
      fix or remove otherwise.
- [ ] **About** (`/about`), **Trust** (`/trust`), **Privacy** (`/privacy`):
      read fully; correct any claims that aren't true for the business.
- [ ] **Homepage hero + section copy** (`src/components/storefront/StorefrontHome.tsx`).
- [ ] **Parenting hub articles** — static demo content in
      `src/components/storefront/catalog-data.ts`; owner should approve or
      replace them.
- [ ] **Product catalog**: seed products use Carter's product photos. Confirm
      the owner has the right to use these images, or replace them via
      BaebeAdmin → Products before launch.
- [ ] **Receipt footer** (`src/components/account/OrderReceipt.tsx`) shows the
      `SUPPORT_EMAIL` env if set — make sure that inbox is real and monitored.

## 7. Vercel build settings

- [ ] Framework preset: Next.js. Build command `npm run build` (this runs
      `next build --webpack` plus a static-asset snapshot script that no-ops on
      a fresh container — if the build fails on it, check
      `scripts/preserve-next-static.mjs`).
- [ ] Do **not** commit or upload any `.env*` file — set values in Vercel only.
      (`.gitignore` already blocks them; keep it that way.)
- [ ] `deploy/` (nginx) and `ecosystem.config.cjs` (pm2) are for the old VPS —
      harmless to keep, but not used on Vercel.

## 8. Post-deploy verification (do all of these on the live URL)

- [ ] Homepage loads; every product link opens (click at least 3).
- [ ] WhatsApp buttons open `wa.me/<the-number>` with a prefilled message.
- [ ] Sign in as a customer (email code arrives — proves Resend works).
- [ ] `/account`: create/edit an address, create a referral code, add a
      wishlist item from the store and see it under Account → Wishlist.
- [ ] Full purchase (section 3) including the confirmation email.
- [ ] `/orders/track` finds that order with the checkout email.
- [ ] BaebeAdmin login works; order appears; move it through
      Received → Processing → Dispatched → Delivered.
- [ ] BaebeCounter login works at a real store; ring up a test sale.
- [ ] Open the homepage and admin on a phone (or 320px devtools) — no
      horizontal scrolling anywhere.

When all boxes are ticked, the site is ready for customers.
