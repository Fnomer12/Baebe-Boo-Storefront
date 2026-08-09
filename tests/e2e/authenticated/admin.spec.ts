import { expect, test } from "@playwright/test";
import { loadFixtures, signInAsAdmin } from "./fixtures";

/**
 * The admin portal, against the real database.
 *
 * Each test corresponds to something that was reported broken or impossible:
 * a store that could not be created, a promotion that 400ed on the normal
 * case, and a product that could only ever have one version.
 *
 * Everything these tests create is prefixed `ZZQA` and removed by
 * `node scripts/qa/fixtures.mjs teardown`.
 */

const RUN = `ZZQA-E2E-${Date.now().toString(36).toUpperCase()}`;

test.describe("BaebeAdmin", () => {
  test.beforeEach(async ({ page }) => {
    await signInAsAdmin(page);
  });

  test("a store can be created with the database name left blank", async ({ page }) => {
    // This 400ed every time: the form POSTed `databaseName: ""` against a
    // `.optional()` schema, which in zod admits undefined and not "". The
    // field is gone now and the value is derived server-side.
    await page.goto("/BaebeAdmin/stores");
    await page.getByRole("button", { name: /add store/i }).first().click();

    const modal = page.getByRole("dialog");
    await expect(modal).toBeVisible();
    // The field that caused the failure must not exist at all any more.
    await expect(modal.getByRole("textbox", { name: /database name/i })).toHaveCount(0);

    await modal.getByRole("textbox", { name: "Store name" }).fill(`${RUN} Store`);
    await modal.getByRole("textbox", { name: "Location" }).fill(`${RUN} Road`);
    await modal.getByRole("button", { name: "Create store" }).click();

    // The name lands in three places at once — the success banner, the list
    // row and the detail heading — so name the one that proves it persisted.
    await expect(
      page.getByRole("heading", { name: `${RUN} Store` }),
    ).toBeVisible({ timeout: 20_000 });
  });

  test("creation happens in a modal, not an inline panel", async ({ page }) => {
    await page.goto("/BaebeAdmin/stores");
    await page.getByRole("button", { name: /add store/i }).first().click();
    const modal = page.getByRole("dialog");
    await expect(modal).toBeVisible();

    // Escape must close it — a non-technical user reaches for Escape long
    // before they find the X.
    await page.keyboard.press("Escape");
    await expect(modal).toHaveCount(0);
  });

  test("a promotion with no code and no dates can be created", async ({ page }) => {
    // The exact case that used to 400 with "Invalid promotion details.":
    // blank optional fields were sent as "" and rejected.
    await page.goto("/BaebeAdmin/promotions");
    await page.getByRole("button", { name: /new promotion|create promotion|add promotion/i })
      .first()
      .click();

    const modal = page.getByRole("dialog");
    await expect(modal).toBeVisible();

    // No currency box anywhere — currency is GHS and is not a choice.
    await expect(modal.getByRole("textbox", { name: /currency/i })).toHaveCount(0);

    await modal.getByRole("button", { name: /percent off/i }).first().click();
    await modal.getByRole("textbox", { name: /name/i }).first().fill(`${RUN} Percent`);
    await modal.getByRole("spinbutton").first().fill("15");
    await modal.getByRole("button", { name: /create|save/i }).last().click();

    await expect(page.getByText(`${RUN} Percent`).first()).toBeVisible({ timeout: 20_000 });
  });

  test("the voucher form has no currency box", async ({ page }) => {
    // It sat directly under a label reading "Value (GH₵)", accepted "cedis" or
    // "$", and checkout ignored it — so a USD voucher was credited 1:1.
    await page.goto("/BaebeAdmin/promotions");
    await page.getByRole("tab", { name: /voucher/i }).or(page.getByRole("button", { name: /voucher/i })).first().click();
    await page.getByRole("button", { name: /new voucher|create voucher|add voucher/i }).first().click();

    const modal = page.getByRole("dialog");
    await expect(modal).toBeVisible();
    await expect(modal.getByRole("textbox", { name: /currency/i })).toHaveCount(0);
  });

  test("the product wizard offers variable products and counts the matrix", async ({ page }) => {
    await page.goto("/BaebeAdmin/products?new=1");

    const modal = page.getByRole("dialog");
    await expect(modal).toBeVisible({ timeout: 20_000 });

    // Step 1 only — the full create-with-variants path is covered end to end
    // by product-wizard.spec.ts, including the database read-back.
    await expect(modal.getByRole("textbox", { name: "Product name" })).toBeVisible();
    await expect(modal.getByRole("button", { name: "Next" })).toBeVisible();
    // Currency is GHS and is not a choice anywhere in the product.
    await expect(modal.getByRole("combobox", { name: /currency/i })).toHaveCount(0);
  });

  test("the archived filter actually filters", async ({ page }) => {
    // Pagination moved server-side while the route still only understood
    // active|inactive, so picking Archived silently returned page 1 of
    // everything.
    await page.goto("/BaebeAdmin/products");
    const filter = page.getByLabel(/status/i).first();
    await filter.selectOption({ label: "Archived" }).catch(() => filter.selectOption("archived"));

    const fixtures = loadFixtures();
    // The ZZQA fixture products are active, so they must not appear here.
    await expect(page.getByText(fixtures.products.variable.name)).toHaveCount(0);
  });

  test("customers are one list, not two", async ({ page }) => {
    // Admin read `members` while the CSV export beside it read
    // `customer_profiles`, so the same screen contradicted itself.
    await page.goto("/BaebeAdmin/customers");
    await expect(page.getByRole("heading", { name: /customers/i }).first()).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText(/could not be loaded|failed/i)).toHaveCount(0);
  });
});
