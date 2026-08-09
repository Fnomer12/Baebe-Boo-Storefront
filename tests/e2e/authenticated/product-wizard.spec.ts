import { expect, test } from "@playwright/test";
import { signInAsAdmin } from "./fixtures";

/**
 * Creating a variable product end to end, against the real database.
 *
 * This is the feature the whole exercise exists for: before it, a hoodie in
 * four sizes had to be four separate products, because `createProduct`
 * hardcoded exactly one "Default Title" variant and no screen could edit it.
 *
 * Everything created here is prefixed `ZZQA` and removed by
 * `node scripts/qa/fixtures.mjs teardown`.
 */

const NAME = `ZZQA Wizard ${Date.now().toString(36).toUpperCase()}`;
// A 1×1 PNG — the wizard requires a main photo and will not advance without one.
const PIXEL = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

test("creates a variable product with a real option matrix", async ({ page }) => {
  test.setTimeout(180_000);
  await signInAsAdmin(page);
  await page.goto("/BaebeAdmin/products?new=1");

  const modal = page.getByRole("dialog");
  await expect(modal).toBeVisible({ timeout: 60_000 });

  // Step 1 — basics.
  // By ROLE, not by label: every field carries an AdminHint trigger whose
  // accessible name is "What is <field>?" — deliberately, so a screen reader
  // does not hear twelve buttons all called "What is this?" — which makes a
  // bare label lookup ambiguous.
  await modal.getByRole("textbox", { name: "Product name" }).fill(NAME);
  await modal.getByRole("spinbutton", { name: "Price" }).fill("150");
  await modal.getByRole("button", { name: "Next" }).click();

  // Step 2 — photos. The file input is visually hidden but still settable.
  await modal
    .locator('input[type="file"]')
    .first()
    .setInputFiles({ name: "zzqa.png", mimeType: "image/png", buffer: PIXEL });
  // The upload goes to Supabase Storage, so Next only becomes effective once
  // the main photo has a URL — wait for step 3 rather than for a fixed delay.
  await modal.getByRole("button", { name: "Next" }).click();
  await expect(
    modal.getByText(/does this product come in different versions/i),
  ).toBeVisible({ timeout: 60_000 });

  // Step 3 — options.
  // The radio itself is `sr-only`, so click the label — which is what a
  // real user taps, and what makes the whole pill a 44px target.
  await modal.getByText("Yes, it has choices").click();

  const optionNames = modal.locator('input[placeholder="Colour"]');
  await optionNames.first().fill("Colour");
  const firstValues = modal.getByPlaceholder(/type a choice|add a choice/i).first();
  for (const value of ["Pink", "Blue"]) {
    await firstValues.fill(value);
    await firstValues.press("Enter");
  }

  await modal.getByRole("button", { name: /add another option/i }).click();
  await expect(optionNames).toHaveCount(2);
  await optionNames.nth(1).fill("Size");
  const secondValues = modal.getByPlaceholder(/type a choice|add a choice/i).nth(1);
  for (const value of ["3M", "6M", "9M"]) {
    await secondValues.fill(value);
    await secondValues.press("Enter");
  }

  // The line that makes this screen make sense to a non-technical seller.
  await expect(modal.getByText(/6 versions \(2 colours × 3 sizes\)/i)).toBeVisible();
  await modal.getByRole("button", { name: "Next" }).click();

  // Step 4 — shops, bulk pricing, stock.
  await modal.getByText("ZZQA Shop Alpha").click();

  const bulk = modal.getByRole("button", { name: "Set price" });
  await bulk.click();
  // Scope to the popover so this cannot pick up a matrix row's price cell.
  const pricePopover = modal.locator("div", { has: page.getByText(/charges the same for all/i) }).last();
  await pricePopover.locator('input[type="number"]').fill("150");
  await pricePopover.getByRole("button", { name: "Apply" }).click();

  // The seed field is the primary path: it fills the count into every
  // version × every ticked shop, which is the whole point of the screen.
  await modal
    .getByRole("spinbutton", { name: /stock per shop to start with/i })
    .fill("5");

  await modal.getByRole("button", { name: "Generate SKUs" }).click();
  await modal.getByRole("button", { name: "Save" }).click();

  // The product lands in the list — and the modal closes, which it would not
  // do on a validation failure.
  await expect(modal).toHaveCount(0, { timeout: 60_000 });
  await expect(page.getByText(NAME).first()).toBeVisible({ timeout: 60_000 });
});
