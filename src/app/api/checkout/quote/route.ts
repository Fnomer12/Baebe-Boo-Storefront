import { NextResponse } from "next/server";
import { quoteCheckoutPromotions } from "@/lib/checkout/promotions";
import {
  CheckoutResolutionError,
  parseCheckoutItems,
  resolveCheckoutBasket,
} from "@/lib/checkout/resolve-basket";
import { rateLimit } from "@/lib/rate-limit";
import { tryCreateServerSupabaseClient } from "@/lib/supabase/server";
import { isSupabaseAdminConfigured } from "@/lib/supabase-admin";

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
    const body = (await request.json()) as Record<string, unknown>;
    const fulfilmentType = body.fulfilmentType === "pickup" ? "pickup" : "delivery";
    if (fulfilmentType === "pickup" && typeof body.shopId !== "string") {
      return fail("Choose a collection branch.");
    }
    if (!isSupabaseAdminConfigured) {
      return fail("Checkout pricing is temporarily unavailable.", 503);
    }
    const basket = await resolveCheckoutBasket({
      items: parseCheckoutItems(body.items),
      fulfilmentType,
      pickupShopId: typeof body.shopId === "string" ? body.shopId : undefined,
      preferredShopId: typeof body.preferredShopId === "string" ? body.preferredShopId : undefined,
      deliveryZoneId: typeof body.deliveryZoneId === "string" ? body.deliveryZoneId : undefined,
    });

    const authClient = await tryCreateServerSupabaseClient();
    const authData = authClient ? (await authClient.auth.getUser()).data : null;
    const quote = await quoteCheckoutPromotions({
      lines: basket.variants.map((variant) => ({
        variantId: variant.id,
        unitPrice: variant.price,
        quantity: variant.quantity,
      })),
      productIds: [...new Set(basket.variants.map((variant) => variant.productId))],
      deliveryFee: basket.deliveryFee,
      promotionCode: typeof body.promotionCode === "string" ? body.promotionCode : null,
      voucherCode: typeof body.voucherCode === "string" ? body.voucherCode : null,
      customerUserId: authData?.user?.id || null,
    });

    return NextResponse.json({
      status: true,
      data: {
        subtotal: quote.subtotal,
        discount: quote.discount,
        voucherCredit: quote.voucherCredit,
        deliveryFee: quote.deliveryFee,
        total: quote.total,
        promotionMessage: quote.promotionMessage,
        promotionApplied: quote.appliedPromotions.some((promotion) => promotion.code),
        promotionCodeValid: quote.promotionCodeValid,
        voucherCode: quote.voucherCode,
        voucherCodeValid: quote.voucherCodeValid,
        voucherMessage: quote.voucherMessage,
        split: basket.allocation.split,
        shipmentCount: basket.allocation.allocations.length,
      },
    });
  } catch (error) {
    if (error instanceof CheckoutResolutionError) return fail(error.message, error.status);
    return fail("Could not calculate checkout pricing.", 500);
  }
}
