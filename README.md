# Baebe Boo Storefront

Baebe Boo's mobile-first national storefront, customer account, branch counter,
and owner administration platform. The implementation follows the construction
manual in [`public/Baebe_Boo_Website_Construction_Manual.pdf`](public/Baebe_Boo_Website_Construction_Manual.pdf).

## Local development

```bash
npm ci
cp .env.production.example .env.local
npm run dev
```

Populate `.env.local` with a Supabase project and Paystack test key. Missing
public Supabase values fall back to a harmless local placeholder in development;
production builds fail closed when required secrets are absent.

## Quality gate

```bash
npm run lint
npm run typecheck
npm test
npm run test:e2e
npm run build
```

Playwright starts the production server automatically. Install its browser once
with `npx playwright install chromium`.

## Database

The normalized commerce schema, row-level security policies, inventory
reservations, and database tests live under [`supabase/`](supabase/README.md).
Apply and rehearse the migration against staging before production.

## Deployment

The target production hostname is `baebe-boo.jtechinnovations.tech`. See
[`docs/deployment-runbook.md`](docs/deployment-runbook.md) for the staging,
production, rollback, DNS, payment, backup, and monitoring checklist.

The CI workflow checks lint, types, unit tests, the production build, and desktop
and mobile journeys. Deployment remains deliberately gated on environment
secrets and the operations-tier decision.
