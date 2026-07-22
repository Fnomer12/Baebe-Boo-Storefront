# Implementation status

## Phase 1 — platform foundation: complete

- Next.js 16 App Router, mobile-first storefront, metadata, sitemap and robots
- Vitest, Playwright desktop/mobile journeys, CI and production build gate
- Consent-gated analytics loaders and Web Vitals intake

## Phase 2 — commerce and inventory: complete locally

- Normalized variants, media, branch inventory and atomic reservations
- Selected size/colour fidelity through cart, order, allocation and payment
- Preferred-branch national allocation, split shipments, delivery zones and pickup
- Server-owned pricing, promotion rules, Paystack verification and webhook replay safety
- 1% paid-purchase rewards, promotion redemption ledger and audited order transitions

## Phase 3 — experience and conversion: complete locally

- Premium homepage, catalog, category/age discovery and real-data product pages
- Zoom, video/3D media support, stock status, WhatsApp, wishlist and compare
- Aggregate best sellers, recently viewed, frequently bought together and recommendations
- Honest promotion countdown/exit prompt, Parenting Hub and family consent capture

## Phase 4 — accounts and trust: complete locally

- Guest checkout, passwordless account access and verified guest-order claiming
- Order history, cross-device wishlist, addresses, rewards, returns and review submission
- Verified-review publication model, trust/privacy/about pages and interactive store map
- Registry/referral schemas and account tracking views are ready; creation/reward campaigns
  remain disabled until business rules and reward amounts are approved.

## Phase 5 — operations and security: complete locally

- RLS/grant hardening, server-derived authorization, admin TOTP MFA and audit logs
- Functional branch counter sale, inventory reconciliation and owner order transitions
- CSP/security headers, secret validation, request throttling and zero npm advisories
- Staging/production, backup, WAF/bot protection and rollback runbook

## Launch inputs still required

These cannot be truthfully supplied by source code and intentionally block cutover:

1. Operations-tier selection and named incident owner.
2. Staging and production Supabase/Paystack credentials plus a staging migration rehearsal.
3. DNS/TLS control for `baebe-boo.jtechinnovations.tech`.
4. Verified branch addresses, coordinates, hours and contact details.
5. Approved mother-and-child hero, store/team/founder media, and real review imports.
6. Analytics/Search Console identifiers and the chosen email/WhatsApp automation provider.
7. Approved point values and fraud rules for referral, review, birthday and social-share rewards.

Production demo catalog content is disabled by default. No invented products, branches,
reviews, dates, opening hours or customer claims are used as live business data.
