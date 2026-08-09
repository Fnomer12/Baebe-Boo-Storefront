import { expect, test } from "@playwright/test";
import { loadFixtures, signInAsAdmin } from "./fixtures";

/**
 * Editing an existing variable product's versions, against the real database.
 *
 * The second half of the original ask: not just creating a product with
 * versions, but going back in and changing ONE version's own price without
 * disturbing its siblings. Before this work there was no variant surface in
 * the admin at all — `patchProduct` only ever touched the `is_default` row.
 *
 * The fixture product deliberately ships with four different prices
 * (120/125/130/135), so a test that set them all to one number would pass for
 * the wrong reason.
 */

/** Pink / 3M, as `scripts/qa/fixtures.mjs` creates it. */
const TARGET = "Pink / 3M";
const ORIGINAL = "120";
const EDITED = "199";

test("changes one version's price and leaves its siblings alone", async ({ page }) => {
  test.setTimeout(180_000);
  const productName = loadFixtures().products.variable.name;

  await signInAsAdmin(page);
  await page.goto("/BaebeAdmin/products");
  await page.getByText(productName).first().click();

  const modal = page.getByRole("dialog");

  async function openVersions() {
    await page.getByRole("button", { name: /edit versions/i }).click();
    await expect(modal).toBeVisible({ timeout: 30_000 });
    // "Edit versions & stock" opens on the OPTIONS step (steps 3-4 of the same
    // wizard); the matrix is one Next away. That order is deliberate — changing
    // an option is what regenerates the matrix, so the seller sees it first.
    await expect(
      modal.getByText(/does this product come in different versions/i),
    ).toBeVisible({ timeout: 30_000 });
    await modal.getByRole("button", { name: "Next" }).click();
  }

  // Addressed by NAME, never by row position: the matrix orders itself, and a
  // positional locator would silently start editing a different version the
  // day that ordering changes.
  const targetPrice = () => modal.getByRole("spinbutton", { name: `Price for ${TARGET}` });
  const siblingPrice = () => modal.getByRole("spinbutton", { name: "Price for Pink / 6M" });

  await openVersions();
  await expect(targetPrice()).toHaveValue(ORIGINAL);
  await expect(siblingPrice()).toHaveValue("125");

  await targetPrice().fill(EDITED);
  await modal.getByRole("button", { name: /^Save/ }).click();
  await expect(modal).toHaveCount(0, { timeout: 60_000 });

  // Reopen: the change has to have gone through the database, not merely the
  // form's own state.
  await openVersions();
  await expect(targetPrice()).toHaveValue(EDITED);
  // …and its sibling must be exactly as it was. This is the assertion that
  // would have failed under the old code, which only ever wrote the default
  // variant.
  await expect(siblingPrice()).toHaveValue("125");

  // Put it back. These fixtures are shared with the counter specs, which assert
  // on the exact prices — a test that leaves the world changed makes the next
  // one fail for a reason that has nothing to do with it.
  await targetPrice().fill(ORIGINAL);
  await modal.getByRole("button", { name: /^Save/ }).click();
  await expect(modal).toHaveCount(0, { timeout: 60_000 });

  await openVersions();
  await expect(targetPrice()).toHaveValue(ORIGINAL);
});
