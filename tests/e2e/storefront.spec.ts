import { expect, test } from "@playwright/test";

test("a first-time parent can understand the brand and reach the catalog", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Everything Your Little One Needs");
  await expect(page.getByText("Authentic Products", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: /shop now/i }).first().click();
  await expect(page).toHaveURL(/\/store/, { timeout: 15_000 });
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("a shopper can open a product and add a national item to the cart", async ({ page }) => {
  await page.goto("/products/cloud-soft-organic-romper");
  await expect(page.getByRole("heading", { name: "Cloud-Soft Organic Romper" })).toBeVisible();
  await page.getByRole("button", { name: /add to bag/i }).click();
  await expect(page.getByRole("status")).toContainText(/bag/i);
  const cart = await page.evaluate(() => JSON.parse(localStorage.getItem("baebe_cart") || "[]"));
  expect(cart[0]).toMatchObject({ id: "fallback-organic-romper", fulfilment: "national" });
});

test("privacy consent persists without returning on reload", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Essential only" }).click();
  await page.reload();
  await expect(page.getByRole("button", { name: "Essential only" })).toHaveCount(0);
});

test("mobile navigation and checkout are keyboard dismissible", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("baebe_consent_v1", "essential"));
  await page.goto("/");
  await page.getByRole("button", { name: "Open menu" }).click();
  await expect(page.getByRole("button", { name: "Close menu" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Close menu" })).not.toBeVisible();

  await page.goto("/products/cloud-soft-organic-romper");
  await page.getByRole("button", { name: /add to bag/i }).click();
  await page.goto("/cart");
  await page.getByRole("button", { name: "Proceed to Checkout" }).click();
  await expect(page.getByRole("dialog", { name: "Delivery Details" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Close checkout" })).toBeFocused();
  await expect(page.locator("main > div").first()).toHaveAttribute("inert", "");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Delivery Details" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Proceed to Checkout" })).toBeFocused();
});

test("unconfigured services fail safely instead of crashing pages", async ({ page, request }) => {
  const options = await request.get("/api/checkout/options");
  expect([200, 503]).toContain(options.status());
  expect(options.status()).not.toBe(500);
  if (options.status() === 503) {
    expect(await options.json()).toMatchObject({
      status: false,
      message: "Checkout options are temporarily unavailable.",
    });
  }

  await page.goto("/account");
  await expect(page).toHaveURL(/\/account\/login/);
  await page.goto("/BaebeAdmin");
  await expect(page).toHaveURL(/\/BaebeAdmin\/login/);
  await page.goto("/BaebeCounter");
  await expect(page).toHaveURL(/\/BaebeCounter\/login/);
});
