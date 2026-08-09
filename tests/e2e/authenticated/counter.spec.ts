import { expect, test } from "@playwright/test";
import { loadFixtures, signInAsCashier } from "./fixtures";

/**
 * The till, against the real database.
 *
 * Every assertion here corresponds to a bug that was reported and reproduced:
 * every session showing the same cashier, one product rendering as four
 * identical cards, and a shop's shelf showing another shop's stock.
 */
test.describe("BaebeCounter", () => {
  test("each cashier sees their own identity and their own shop", async ({ page }) => {
    // The reported symptom was that EVERY login showed "Amanda Armstrong /
    // 2026-26BB9DE9FC · Sogakope", because getCounterAuthorization selected
    // from shop_staff with `.limit(1)` and no WHERE clause at all.
    const alpha = await signInAsCashier(page, "alpha");
    await expect(page.getByText(alpha.cashier.name)).toBeVisible();
    await expect(page.getByText(alpha.cashier.code, { exact: false })).toBeVisible();
    await expect(page.getByText(`Counter · ${alpha.shop.name}`)).toBeVisible();

    await page.getByText("Sign out").click();
    await page.waitForURL(/login/, { timeout: 30_000 });

    const beta = await signInAsCashier(page, "beta");
    await expect(page.getByText(beta.cashier.name)).toBeVisible();
    await expect(page.getByText(`Counter · ${beta.shop.name}`)).toBeVisible();
    // The decisive assertion: the second cashier must NOT inherit the first's.
    await expect(page.getByText(alpha.cashier.name)).toHaveCount(0);
  });

  test("a product with four versions is one card, not four", async ({ page }) => {
    const fixtures = loadFixtures();
    await signInAsCashier(page, "alpha");

    const cards = page.getByRole("article").filter({
      hasText: fixtures.products.variable.name,
    });
    await expect(cards).toHaveCount(1);
    await expect(cards.first()).toContainText("4 versions");
    // Per-variant pricing, surfaced as a range rather than one arbitrary price.
    await expect(cards.first()).toContainText("From GH₵");
  });

  test("a single-version product keeps its one-tap add", async ({ page }) => {
    // Grouping must not cost every product an extra tap at a busy till.
    const fixtures = loadFixtures();
    await signInAsCashier(page, "alpha");

    const card = page
      .getByRole("article")
      .filter({ hasText: fixtures.products.simple.name });
    await expect(
      card.getByRole("button", { name: `Add one ${fixtures.products.simple.name}` }),
    ).toBeVisible();
  });

  test("the version picker labels each version and prices it separately", async ({ page }) => {
    const fixtures = loadFixtures();
    await signInAsCashier(page, "alpha");

    await page
      .getByRole("article")
      .filter({ hasText: fixtures.products.variable.name })
      .getByRole("button", { name: /choose version/i })
      .click();

    const picker = page.getByRole("dialog");
    await expect(picker).toBeVisible();
    // Colour before size, whatever order jsonb returns the keys in.
    await expect(picker.getByText("Pink · 3M")).toBeVisible();
    await expect(picker.getByText("Blue · 6M")).toBeVisible();
    await expect(picker.getByText("GH₵120.00")).toBeVisible();
    await expect(picker.getByText("GH₵135.00")).toBeVisible();
  });

  test("two different versions ring up at their own prices", async ({ page }) => {
    const fixtures = loadFixtures();
    const name = fixtures.products.variable.name;
    await signInAsCashier(page, "alpha");

    await page
      .getByRole("article")
      .filter({ hasText: name })
      .getByRole("button", { name: /choose version/i })
      .click();

    await page.getByRole("button", { name: `Add one ${name} Pink · 3M` }).click();
    await page.getByRole("button", { name: `Add one ${name} Blue · 6M` }).click();
    await page.getByRole("button", { name: "Done" }).click();

    // 120 + 135. Before per-variant pricing reached the till these were both
    // whatever price the product row carried.
    await expect(page.getByText("Review sale · 2 items · GH₵255.00")).toBeVisible();

    await page.getByText("Review sale").click();
    // The cart must name the versions, or the cashier hands over the wrong size.
    await expect(page.getByText("Pink · 3M")).toBeVisible();
    await expect(page.getByText("Blue · 6M")).toBeVisible();
  });

  test("a shop only sees its own stock", async ({ page }) => {
    // The ZZQA products are stocked at Alpha only.
    const fixtures = loadFixtures();
    await signInAsCashier(page, "beta");

    await expect(page.getByText(fixtures.products.variable.name)).toHaveCount(0);
    await expect(page.getByText(fixtures.products.simple.name)).toHaveCount(0);
  });

  test("the stock screen loads and names each version", async ({ page }) => {
    const fixtures = loadFixtures();
    await signInAsCashier(page, "alpha");

    await page.goto("/BaebeCounter/stock");
    await expect(page.getByRole("heading", { name: "Stock" })).toBeVisible();
    await expect(page.getByRole("table")).toContainText(fixtures.products.variable.name);
    await expect(page.getByRole("table")).toContainText("Pink · 3M");
  });

  test("the bare /stock path a cashier types redirects instead of 404ing", async ({ page }) => {
    await signInAsCashier(page, "alpha");
    await page.goto("/stock");
    await expect(page).toHaveURL(/\/BaebeCounter\/stock$/);
  });
});
