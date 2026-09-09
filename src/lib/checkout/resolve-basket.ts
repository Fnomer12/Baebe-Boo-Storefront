import "server-only";

import { allocateInventory, type AllocationResult } from "@/domain/commerce/allocation";
import { supabaseAdmin } from "@/lib/supabase-admin";

export type CheckoutItemInput = {
  productId: string;
  variantId?: string;
  quantity: number;
};

export type ResolvedVariant = {
  id: string;
  productId: string;
  productCategory: string | null;
  price: number;
  /**
   * Captured at checkout so `report_daily_profit` computes COGS against the
   * cost at the time of sale, not whatever the cost happens to be when the
   * report is run.
   */
  costPrice: number;
  quantity: number;
};

type ProductRow = { id: string; name: string; price: number | string; category: string | null };
type VariantRow = {
  id: string;
  product_id: string;
  price: number | string;
  cost_price: number | string | null;
  is_default: boolean;
};
type InventoryRow = {
  id: string;
  variant_id: string;
  shop_id: string;
  on_hand: number;
  reserved: number;
};

export class CheckoutResolutionError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

export type ResolvedCheckoutBasket = {
  products: ProductRow[];
  variants: ResolvedVariant[];
  inventory: InventoryRow[];
  allocation: Extract<AllocationResult, { status: "allocated" }>;
  merchandiseTotal: number;
  deliveryFee: number;
};

export function parseCheckoutItems(value: unknown): CheckoutItemInput[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 50) {
    throw new CheckoutResolutionError("Your cart is empty or too large.");
  }

  return value.map((raw: unknown) => {
    if (!raw || typeof raw !== "object") {
      throw new CheckoutResolutionError("Your cart contains an invalid item.");
    }
    const item = raw as Record<string, unknown>;
    if (
      typeof item.productId !== "string" ||
      (item.variantId !== undefined && typeof item.variantId !== "string") ||
      !Number.isInteger(item.quantity) ||
      Number(item.quantity) < 1 ||
      Number(item.quantity) > 100
    ) {
      throw new CheckoutResolutionError("Your cart contains an invalid item.");
    }
    return {
      productId: item.productId,
      variantId: typeof item.variantId === "string" ? item.variantId : undefined,
      quantity: Number(item.quantity),
    };
  });
}

export async function resolveCheckoutBasket(input: {
  items: CheckoutItemInput[];
  fulfilmentType: "delivery" | "pickup";
  pickupShopId?: string;
  preferredShopId?: string;
  deliveryZoneId?: string;
}): Promise<ResolvedCheckoutBasket> {
  const productIds = [...new Set(input.items.map((item) => item.productId))];
  const [{ data: productsData, error: productError }, { data: variantsData, error: variantError }] =
    await Promise.all([
      supabaseAdmin.from("products").select("id,name,price,category").in("id", productIds).eq("is_active", true),
      supabaseAdmin.from("product_variants").select("id,product_id,price,cost_price,is_default").in("product_id", productIds).eq("is_active", true),
    ]);
  const products = (productsData || []) as ProductRow[];
  const variantRows = (variantsData || []) as VariantRow[];
  if (productError || variantError || products.length !== productIds.length) {
    throw new CheckoutResolutionError("One or more products are no longer available.", 409);
  }

  const aggregated = new Map<string, ResolvedVariant>();
  const categoryByProduct = new Map(products.map((product) => [product.id, product.category || null]));
  for (const item of input.items) {
    const candidates = variantRows.filter((variant) => variant.product_id === item.productId);
    const selected = item.variantId
      ? candidates.find((variant) => variant.id === item.variantId)
      : candidates.find((variant) => variant.is_default) || candidates[0];
    if (!selected) {
      throw new CheckoutResolutionError("A selected size or colour is no longer available.", 409);
    }
    const existing = aggregated.get(selected.id);
    const quantity = (existing?.quantity || 0) + item.quantity;
    if (quantity > 100) throw new CheckoutResolutionError("A cart item exceeds the quantity limit.");
    aggregated.set(selected.id, {
      id: selected.id,
      productId: selected.product_id,
      productCategory: categoryByProduct.get(selected.product_id) || null,
      price: Number(selected.price),
      costPrice: Number(selected.cost_price || 0),
      quantity,
    });
  }
  const variants = [...aggregated.values()];
  if (variants.some((variant) => !Number.isFinite(variant.price) || variant.price < 0)) {
    throw new CheckoutResolutionError("One or more product prices are invalid.", 409);
  }

  const { data: inventoryData, error: inventoryError } = await supabaseAdmin
    .from("inventory_levels")
    .select("id,variant_id,shop_id,on_hand,reserved")
    .in("variant_id", variants.map((variant) => variant.id));
  if (inventoryError) throw new CheckoutResolutionError("Could not check current inventory.", 503);

  const allInventory = (inventoryData || []) as InventoryRow[];
  const inventory = input.fulfilmentType === "pickup"
    ? allInventory.filter((level) => level.shop_id === input.pickupShopId)
    : allInventory;
  const branchIds = [...new Set(inventory.map((level) => level.shop_id))];
  if (input.preferredShopId && branchIds.includes(input.preferredShopId)) {
    branchIds.splice(branchIds.indexOf(input.preferredShopId), 1);
    branchIds.unshift(input.preferredShopId);
  }
  const branchStock = branchIds.map((branchId) => ({
    branchId,
    stock: Object.fromEntries(
      inventory
        .filter((level) => level.shop_id === branchId)
        .map((level) => [level.variant_id, Math.max(0, Number(level.on_hand) - Number(level.reserved))]),
    ),
  }));
  const allocation = allocateInventory(
    variants.map((variant) => ({ variantId: variant.id, quantity: variant.quantity })),
    branchStock,
    { preferredBranchId: input.preferredShopId },
  );
  if (allocation.status === "insufficient_stock") {
    throw new CheckoutResolutionError(
      input.fulfilmentType === "pickup"
        ? "This branch cannot fulfil every selected size and colour."
        : "One or more selected sizes or colours no longer have enough stock.",
      409,
    );
  }

  const merchandiseTotal = variants.reduce(
    (sum, variant) => sum + variant.price * variant.quantity,
    0,
  );
  let deliveryFee = 0;
  if (input.fulfilmentType === "delivery") {
    if (!input.deliveryZoneId) throw new CheckoutResolutionError("Choose a delivery zone.");
    const { data: zone, error: zoneError } = await supabaseAdmin
      .from("delivery_zones")
      .select("base_fee,free_delivery_threshold")
      .eq("id", input.deliveryZoneId)
      .eq("is_active", true)
      .maybeSingle();
    if (zoneError || !zone) throw new CheckoutResolutionError("Choose a valid delivery zone.");
    const free = zone.free_delivery_threshold !== null && merchandiseTotal >= Number(zone.free_delivery_threshold);
    deliveryFee = free ? 0 : Number(zone.base_fee) * allocation.allocations.length;
  }

  return { products, variants, inventory, allocation, merchandiseTotal, deliveryFee };
}
