import { beforeEach, describe, expect, it, vi } from "vitest";
import { addProductToCart, recordRecentlyViewed, storefrontKeys, toggleProductList } from "./storefront-state";
import { fallbackProducts, fallbackShops } from "../components/storefront/catalog-data";

describe("storefront persistence", () => {
  beforeEach(() => window.localStorage.clear());

  it("adds a national item without inventing a branch and broadcasts the cart update", () => {
    const listener = vi.fn();
    window.addEventListener("baebe_cart_updated", listener);
    addProductToCart(fallbackProducts[0], { color: "Cream", size: "0–3M" });
    const stored = JSON.parse(window.localStorage.getItem(storefrontKeys.cart) || "[]") as Array<Record<string, unknown>>;
    expect(stored[0]).toMatchObject({ id: fallbackProducts[0].id, fulfilment: "national", color: "Cream", size: "0–3M" });
    expect(stored[0]).not.toHaveProperty("shopId");
    expect(listener).toHaveBeenCalledOnce();
    window.removeEventListener("baebe_cart_updated", listener);
  });

  it("keeps branch selection when one is explicitly provided", () => {
    addProductToCart(fallbackProducts[1], { shop: fallbackShops[0], stockAvailable: 2 });
    const stored = JSON.parse(window.localStorage.getItem(storefrontKeys.cart) || "[]") as Array<Record<string, unknown>>;
    expect(stored[0]).toMatchObject({ fulfilment: "branch", shopId: fallbackShops[0].id, stockAvailable: 2 });
    expect(window.localStorage.getItem(storefrontKeys.shop)).toContain(fallbackShops[0].id);
  });

  it("caps compare selections and recently viewed history", () => {
    expect(toggleProductList(storefrontKeys.compare, "one", 2)).toEqual({ active: true, full: false });
    expect(toggleProductList(storefrontKeys.compare, "two", 2)).toEqual({ active: true, full: false });
    expect(toggleProductList(storefrontKeys.compare, "three", 2)).toEqual({ active: false, full: true });
    for (let index = 0; index < 15; index += 1) recordRecentlyViewed(String(index));
    const viewed = JSON.parse(window.localStorage.getItem(storefrontKeys.recentlyViewed) || "[]") as string[];
    expect(viewed).toHaveLength(12);
    expect(viewed[0]).toBe("14");
  });
});
