import { expect, test } from "@playwright/test";

test("a first-time parent can understand the brand and reach the catalog", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Essential only" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Everything Your Little One Needs");
  await expect(page.getByText("Authentic products", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: /shop the collection/i }).click();
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

test("a shopper's chosen version travels with the cart line", async ({ page }) => {
  // The bug: the buy box rendered exactly two hardcoded pickers and matched a
  // variant on `color`/`size`, so a product's options could never be anything
  // else — and the cart line only remembered those two fields.
  await page.addInitScript(() => localStorage.setItem("baebe_consent_v1", "essential"));
  await page.goto("/products/cloud-soft-organic-romper");
  await page.getByRole("button", { name: "Sky", exact: true }).click();
  await page.getByRole("button", { name: "3–6M", exact: true }).click();
  await page.getByRole("button", { name: /add to bag/i }).click();
  await expect(page.getByRole("status")).toContainText(/bag/i);

  const cart = await page.evaluate(() => JSON.parse(localStorage.getItem("baebe_cart") || "[]"));
  expect(cart).toHaveLength(1);
  expect(cart[0].optionValues).toEqual({ colour: "Sky", size: "3–6M" });

  await page.goto("/cart");
  await expect(page.getByText("Sky / 3–6M")).toBeVisible();
});

test("an option with only one value is a detail row, not a one-button picker", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("baebe_consent_v1", "essential"));
  await page.goto("/products/rainbow-stacking-garden");
  await expect(page.getByRole("heading", { name: "Rainbow Stacking Garden" })).toBeVisible();
  // Nothing to choose between, so there is nothing to tap...
  await expect(page.getByRole("button", { name: "Rainbow", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "12 pieces", exact: true })).toHaveCount(0);
  // ...but the shopper still has to be told what they are buying.
  await expect(page.getByText("Rainbow", { exact: true })).toBeVisible();
  await expect(page.getByText("12 pieces", { exact: true })).toBeVisible();
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
  await page.getByRole("link", { name: "Proceed to Checkout" }).click();
  await expect(page).toHaveURL(/\/checkout/, { timeout: 15_000 });
  await expect(page.getByRole("heading", { name: "Delivery & Payment" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/\/checkout/);
  await expect(page.getByRole("link", { name: "Back to cart" })).toBeVisible();
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

test("every counter workspace is behind the counter login", async ({ page }) => {
  for (const path of [
    "/BaebeCounter",
    "/BaebeCounter/orders",
    "/BaebeCounter/sales",
    "/BaebeCounter/stock",
  ]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/BaebeCounter\/login/);
  }
});

test("counter APIs refuse an anonymous caller with actionable JSON", async ({ request }) => {
  // Route handlers must use authorizeCounterApi(), not requireCounter(). The
  // latter calls redirect(), which a fetch sees as a 307 to an HTML login page
  // — unusable by the client, and for a POST it drops the body silently.
  for (const path of [
    "/api/counter/session",
    "/api/counter/catalog",
    "/api/counter/stock",
    "/api/counter/sales",
    "/api/counter/orders",
  ]) {
    const response = await request.get(path, { maxRedirects: 0 });
    expect(response.status(), `GET ${path}`).toBe(401);
    expect(response.headers()["content-type"]).toContain("application/json");
    expect(await response.json()).toMatchObject({ message: expect.any(String) });
  }

  const sale = await request.post("/api/counter/sales", {
    maxRedirects: 0,
    data: {
      items: [{ variantId: "00000000-0000-4000-8000-000000000000", quantity: 1 }],
      paymentMethod: "cash",
    },
  });
  expect(sale.status()).toBe(401);
  expect(sale.headers()["content-type"]).toContain("application/json");
});
