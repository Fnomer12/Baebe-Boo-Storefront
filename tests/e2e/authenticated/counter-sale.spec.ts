import { expect, test } from "@playwright/test";
import { loadFixtures, signInAsCashier } from "./fixtures";

/**
 * Completing a sale at the till.
 *
 * This is the one path that had NEVER worked. `complete_counter_sale` inserted
 * `order_items` without `unit_price` or `total_price`, both of which are
 * NOT NULL with no default, so Postgres rejected every row and the whole
 * function rolled back. The database held zero `order_items` — not one line
 * item, from any sale, ever — and the cashier saw a raw constraint violation.
 *
 * Fixed by 20260807_counter_sale_order_item_columns.sql.
 *
 * Kept in its own file because it MUTATES stock: a completed sale decrements
 * `inventory_levels`, so it must not run before the specs that assert exact
 * counts.
 */
test("rings up and completes a real sale", async ({ page }) => {
  test.setTimeout(180_000);
  const fixtures = loadFixtures();
  const name = fixtures.products.variable.name;

  await signInAsCashier(page, "alpha");

  await page
    .getByRole("article")
    .filter({ hasText: name })
    .getByRole("button", { name: /choose version/i })
    .click();
  await page.getByRole("button", { name: `Add one ${name} Pink · 3M` }).click();
  await page.getByRole("button", { name: "Done" }).click();

  await page.getByText("Review sale").click();
  await page.getByRole("button", { name: /complete sale/i }).click();

  // The success notice carries the order number. Before the fix this showed a
  // Postgres error about a null value in column "unit_price".
  await expect(page.getByText(/Sale .* completed/i)).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(/could not be completed|unit_price|null value/i)).toHaveCount(0);
});
