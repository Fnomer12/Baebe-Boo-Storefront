import {
  cartLineOptionValues,
  cartLineSignature,
  legacyCartLineFields,
} from "@/domain/catalog/cart-line-options";
import type { OptionSelection } from "@/domain/catalog/product-options";
import type { StorefrontProduct, StorefrontShop } from "../components/storefront/catalog-data";

export const storefrontKeys = {
  cart: "baebe_cart",
  shop: "baebe_selected_shop",
  wishlist: "baebe_wishlist",
  compare: "baebe_compare",
  recentlyViewed: "baebe_recently_viewed",
} as const;

export type StorefrontCartItem = {
  id: string;
  name: string;
  category: string;
  age: string;
  gender: string;
  price: number;
  imageUrl: string;
  quantity: number;
  variantId?: string;
  /** The chosen value per option. What every new line is written with. */
  optionValues?: OptionSelection;
  /**
   * @deprecated The pre-variable-products shape. Still written for one release
   * so pages that have not moved to `optionValues` keep telling lines apart,
   * and still read so carts saved before the release survive. See
   * `src/domain/catalog/cart-line-options.ts`.
   */
  color?: string;
  /** @deprecated See `color`. */
  size?: string;
  shop?: StorefrontShop;
  shopId?: string;
  stockAvailable?: number;
  fulfilment: "national" | "branch";
};

function readUnknown(key: string): unknown {
  try {
    return JSON.parse(window.localStorage.getItem(key) || "null") as unknown;
  } catch {
    return null;
  }
}

function readStringList(key: string): string[] {
  const value = readUnknown(key);
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export function selectedStore(): StorefrontShop | undefined {
  const value = readUnknown(storefrontKeys.shop);
  if (!value || typeof value !== "object" || !("id" in value) || typeof value.id !== "string") return undefined;
  const record = value as Record<string, unknown>;
  return {
    id: value.id,
    name: typeof record.name === "string" ? record.name : "Baebe Boo",
    location: typeof record.location === "string" ? record.location : "Ghana",
    hours: typeof record.hours === "string" ? record.hours : "",
    phone: typeof record.phone === "string" ? record.phone : "",
  };
}

export function addProductToCart(
  product: StorefrontProduct,
  options: {
    /** The chosen value per option, keyed by lowercase option name. */
    optionValues?: OptionSelection;
    /** @deprecated Pass `optionValues`. Folded in for one release. */
    color?: string;
    /** @deprecated Pass `optionValues`. Folded in for one release. */
    size?: string;
    variantId?: string;
    unitPrice?: number;
    shop?: StorefrontShop;
    stockAvailable?: number;
  } = {},
): number {
  const value = readUnknown(storefrontKeys.cart);
  const cart = Array.isArray(value) ? value.filter((item): item is StorefrontCartItem => Boolean(item && typeof item === "object" && "id" in item)) : [];
  const optionValues = cartLineOptionValues(options);
  const signature = cartLineSignature({
    id: product.id,
    variantId: options.variantId,
    optionValues,
    shopId: options.shop?.id,
  });
  // Matching on the signature rather than field-by-field is what lets a line
  // saved before the options release merge with the same choice made today.
  const matchIndex = cart.findIndex((item) => cartLineSignature(item) === signature);
  const updated = [...cart];
  if (matchIndex >= 0) {
    const current = updated[matchIndex];
    const nextQuantity = current.quantity + 1;
    updated[matchIndex] = { ...current, quantity: options.stockAvailable ? Math.min(nextQuantity, options.stockAvailable) : nextQuantity };
  } else {
    updated.push({
      id: product.id,
      name: product.name,
      category: product.category,
      age: product.age,
      gender: product.gender,
      price: options.unitPrice ?? product.price,
      imageUrl: product.imageUrl,
      quantity: 1,
      variantId: options.variantId,
      ...(Object.keys(optionValues).length > 0 ? { optionValues } : {}),
      ...legacyCartLineFields(optionValues),
      shop: options.shop,
      shopId: options.shop?.id,
      stockAvailable: options.stockAvailable,
      fulfilment: options.shop ? "branch" : "national",
    });
  }
  window.localStorage.setItem(storefrontKeys.cart, JSON.stringify(updated));
  if (options.shop) window.localStorage.setItem(storefrontKeys.shop, JSON.stringify(options.shop));
  window.dispatchEvent(new Event("baebe_cart_updated"));
  return updated.reduce((total, item) => total + Number(item.quantity || 1), 0);
}

export function toggleProductList(key: typeof storefrontKeys.wishlist | typeof storefrontKeys.compare, productId: string, maximum = Number.POSITIVE_INFINITY): { active: boolean; full: boolean } {
  const current = readStringList(key);
  const active = current.includes(productId);
  if (active) {
    window.localStorage.setItem(key, JSON.stringify(current.filter((id) => id !== productId)));
    return { active: false, full: false };
  }
  if (current.length >= maximum) return { active: false, full: true };
  window.localStorage.setItem(key, JSON.stringify([...current, productId]));
  return { active: true, full: false };
}

export function productListContains(key: typeof storefrontKeys.wishlist | typeof storefrontKeys.compare, productId: string): boolean {
  return readStringList(key).includes(productId);
}

export function compareProductIds(): string[] {
  return readStringList(storefrontKeys.compare);
}

export function recordRecentlyViewed(productId: string): void {
  const current = readStringList(storefrontKeys.recentlyViewed).filter((id) => id !== productId);
  window.localStorage.setItem(storefrontKeys.recentlyViewed, JSON.stringify([productId, ...current].slice(0, 12)));
}

export function recentlyViewedProductIds(): string[] {
  return readStringList(storefrontKeys.recentlyViewed);
}
