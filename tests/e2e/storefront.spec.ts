import { expect, test } from "@playwright/test";

test("a first-time parent can understand the brand and reach the catalog", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Everything Your Little One Needs");
  await expect(page.getByText("Authentic Products", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: /shop now/i }).first().click();
  await expect(page).toHaveURL(/\/store/);
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
