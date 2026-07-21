import { NextResponse } from "next/server";
import { allocateInventory } from "@/domain/commerce/allocation";
import { quoteCheckoutPromotions } from "@/lib/checkout/promotions";
import { rateLimit } from "@/lib/rate-limit";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type CheckoutItem = { productId: string; quantity: number };
type VariantRow = {
  id: string;
  product_id: string;
  price: number | string;
  is_default: boolean;
};
type InventoryRow = {
  variant_id: string;
  shop_id: string;
  on_hand: number;
  reserved: number;
};

function fail(message: string, status = 400) {
  return NextResponse.json({ status: false, message }, { status });
}

export async function POST(request: Request) {
  const throttle = rateLimit(request, "checkout-quote", 30, 60_000);
  if (!throttle.allowed) {
    return NextResponse.json(
      { status: false, message: "Too many quote requests. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(throttle.retryAfter) } },
    );
  }

  try {
    const body = (await request.json()) as {
      items?: unknown;
      fulfilmentType?: unknown;
      deliveryZoneId?: unknown;
      shopId?: unknown;
      promotionCode?: unknown;
    };
    if (!Array.isArray(body.items) || body.items.length === 0 || body.items.length > 50) {
      return fail("Your cart is empty or too large.");
    }
    if (typeof body.promotionCode === "string" && body.promotionCode.trim().length > 64) {
      return fail("That promotion code is too long.");
    }
    const quantities = new Map<string, number>();
    for (const raw of body.items as CheckoutItem[]) {
      if (
        !raw ||
        typeof raw.productId !== "string" ||
        !Number.isInteger(raw.quantity) ||
        raw.quantity < 1 ||
        raw.quantity > 100
      ) {
        return fail("Your cart contains an invalid item.");
      }
      quantities.set(raw.productId, (quantities.get(raw.productId) || 0) + raw.quantity);
    }
    const fulfilmentType = body.fulfilmentType === "pickup" ? "pickup" : "delivery";
    if (fulfilmentType === "pickup" && typeof body.shopId !== "string") {
      return fail("Choose a collection branch.");
    }

    const productIds = [...quantities.keys()];
    const [{ data: products, error: productError }, { data: variantData, error: variantError }] =
      await Promise.all([
        supabaseAdmin.from("products").select("id").in("id", productIds).eq("is_active", true),
        supabaseAdmin
          .from("product_variants")
          .select("id,product_id,price,is_default")
          .in("product_id", productIds)
          .eq("is_active", true),
      ]);
    if (productError || variantError || (products || []).length !== productIds.length) {
      return fail("One or more products are no longer available.", 409);
    }
    const variants = productIds.map((productId) => {
      const candidates = ((variantData || []) as VariantRow[]).filter(
        (variant) => variant.product_id === productId,
      );
      return candidates.find((variant) => variant.is_default) || candidates[0];
    });
    if (variants.some((variant) => !variant)) {
      return fail("One or more product options are unavailable.", 409);
    }

    const { data: inventoryData, error: inventoryError } = await supabaseAdmin
      .from("inventory_levels")
      .select("variant_id,shop_id,on_hand,reserved")
      .in("variant_id", variants.map((variant) => variant.id));
    if (inventoryError) return fail("Could not check current inventory.", 503);
    const inventory = ((inventoryData || []) as InventoryRow[]).filter(
      (level) => fulfilmentType !== "pickup" || level.shop_id === body.shopId,
    );
    const branchIds = [...new Set(inventory.map((level) => level.shop_id))];
    const allocation = allocateInventory(
      variants.map((variant) => ({
        variantId: variant.id,
        quantity: quantities.get(variant.product_id) || 0,
      })),
      branchIds.map((branchId) => ({
        branchId,
        stock: Object.fromEntries(
          inventory
            .filter((level) => level.shop_id === branchId)
            .map((level) => [
              level.variant_id,
              Math.max(0, Number(level.on_hand) - Number(level.reserved)),
            ]),
        ),
      })),
    );
    if (allocation.status === "insufficient_stock") {
      return NextResponse.json(
        {
          status: false,
          message: fulfilmentType === "pickup"
            ? "This branch cannot fulfil every item in the cart."
            : "One or more items no longer have enough stock.",
          shortages: allocation.shortages,
        },
        { status: 409 },
      );
    }

    const lines = variants.map((variant) => ({
      variantId: variant.id,
      unitPrice: Number(variant.price),
      quantity: quantities.get(variant.product_id) || 0,
    }));
    const merchandiseSubtotal = lines.reduce(
      (sum, line) => sum + line.unitPrice * line.quantity,
      0,
    );
    let deliveryFee = 0;
    if (fulfilmentType === "delivery") {
      if (typeof body.deliveryZoneId !== "string") return fail("Choose a delivery zone.");
      const { data: zone, error: zoneError } = await supabaseAdmin
        .from("delivery_zones")
        .select("base_fee,free_delivery_threshold")
        .eq("id", body.deliveryZoneId)
        .eq("is_active", true)
        .maybeSingle();
      if (zoneError || !zone) return fail("Choose a valid delivery zone.");
      const free =
        zone.free_delivery_threshold !== null &&
        merchandiseSubtotal >= Number(zone.free_delivery_threshold);
      deliveryFee = free ? 0 : Number(zone.base_fee) * allocation.allocations.length;
    }

    const authClient = await createServerSupabaseClient();
    const { data: authData } = await authClient.auth.getUser();
    const quote = await quoteCheckoutPromotions({
      lines,
      productIds,
      deliveryFee,
      promotionCode:
        typeof body.promotionCode === "string" ? body.promotionCode : null,
      customerUserId: authData.user?.id || null,
    });
    return NextResponse.json({
      status: true,
      data: {
        subtotal: quote.subtotal,
        discount: quote.discount,
        deliveryFee: quote.deliveryFee,
        total: quote.total,
        promotionMessage: quote.promotionMessage,
        promotionApplied: quote.appliedPromotions.some((promotion) => promotion.code),
        promotionCodeValid: quote.promotionCodeValid,
        split: allocation.split,
        shipmentCount: allocation.allocations.length,
      },
    });
  } catch {
    return fail("Could not calculate checkout pricing.", 500);
  }
}
