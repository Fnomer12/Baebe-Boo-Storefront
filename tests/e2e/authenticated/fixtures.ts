import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import type { Page } from "@playwright/test";

/**
 * Credentials for the ZZQA fixtures, written by `scripts/qa/fixtures.mjs create`.
 *
 * Read from disk rather than baked in: these are real logins on the production
 * Supabase project, and the file is gitignored.
 */
export type QaFixtures = {
  shops: Record<"alpha" | "beta", { id: string; name: string }>;
  counter: Record<
    "alpha" | "beta",
    { id: string; name: string; code: string; email: string; password: string; shopId: string }
  >;
  admin: { email: string; password: string };
  products: {
    variable: { id: string; sku: string; name: string; variantCount: number };
    simple: { id: string; sku: string; name: string; variantCount: number };
  };
};

const FIXTURES_PATH = resolve(process.cwd(), ".qa-fixtures.json");

export function loadFixtures(): QaFixtures {
  if (!existsSync(FIXTURES_PATH)) {
    throw new Error(
      "No .qa-fixtures.json. Run `node scripts/qa/fixtures.mjs create` first.",
    );
  }
  return JSON.parse(readFileSync(FIXTURES_PATH, "utf8")) as QaFixtures;
}

/** Sign in at the till as one of the two QA cashiers. */
export async function signInAsCashier(page: Page, which: "alpha" | "beta") {
  const fixtures = loadFixtures();
  const cashier = fixtures.counter[which];

  await page.goto("/BaebeCounter/login");
  await page.getByPlaceholder("e.g. BB1A2B3C").fill(cashier.code);
  await page.getByPlaceholder("Enter your password").fill(cashier.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/BaebeCounter(?!\/login)/, { timeout: 30_000 });

  return { cashier, shop: fixtures.shops[which] };
}

/** Sign in to the admin portal as the QA admin. */
export async function signInAsAdmin(page: Page) {
  const fixtures = loadFixtures();
  // The login page takes a bare username and appends the staff domain itself.
  const username = fixtures.admin.email.split("@")[0];

  await page.goto("/BaebeAdmin/login");
  // By placeholder, not by label: the page carries a "Need help?" control whose
  // accessible name also contains "password", so a /password/i label lookup is
  // ambiguous and resolves to the button.
  await page.getByPlaceholder(/admin or admin@/i).fill(username);
  await page.getByPlaceholder(/enter your password/i).fill(fixtures.admin.password);
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await page.waitForURL(/\/BaebeAdmin(?!\/login)/, { timeout: 30_000 });

  return fixtures;
}
