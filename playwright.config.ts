import { defineConfig, devices } from "@playwright/test";

/**
 * Two tiers, because CI cannot run the authenticated specs.
 *
 * `.github/workflows/ci.yml` runs `test:e2e` with placeholder Supabase
 * credentials (`https://example.supabase.co`), so no admin or counter flow can
 * sign in there. Pointing CI at the real project is not an option either:
 * there is no staging database — `.env.development.local` says so — so every
 * run would create real rows in the live catalogue on every push.
 *
 * So the public storefront specs stay in CI, and the authenticated ones live
 * under `tests/e2e/authenticated/` and run only when
 * `QA_AUTHENTICATED_E2E=1` is set, against fixtures created by
 * `node scripts/qa/fixtures.mjs create`.
 */
const authenticated = process.env.QA_AUTHENTICATED_E2E === "1";

// Overridable so a run can attach to a dev server that is already up rather
// than paying to boot a second one.
const port = process.env.E2E_PORT || "3012";
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "mobile-chromium",
      use: { ...devices["Pixel 7"] },
      testIgnore: /authenticated\//,
    },
    {
      name: "desktop-chromium",
      use: { ...devices["Desktop Chrome"] },
      testIgnore: /authenticated\//,
    },
    // Serial, and desktop only: these specs sign in, mutate live data and tear
    // it down, so running two of them at once against one fixture set would
    // have them fighting over the same rows.
    ...(authenticated
      ? [
          {
            name: "authenticated",
            use: { ...devices["Desktop Chrome"] },
            testMatch: /authenticated\/.*\.spec\.ts/,
            fullyParallel: false,
            workers: 1,
          },
        ]
      : []),
  ],
  webServer: {
    command: `npm run dev -- --hostname 127.0.0.1 --port ${port}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
