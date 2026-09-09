import { NextResponse } from "next/server";
import { quoteCheckoutPromotions } from "@/lib/checkout/promotions";
import {
  CheckoutResolutionError,
  parseCheckoutItems,
  resolveCheckoutBasket,
} from "@/lib/checkout/resolve-basket";
import { rateLimit } from "@/lib/rate-limit";
import { requireServerEnv } from "@/lib/server-env";
import { STORE_NOT_READY_MESSAGE, isStoreReady } from "@/lib/store-readiness";
import { isSupabaseAdminConfigured, supabaseAdmin } from "@/lib/supabase-admin";
import { tryCreateServerSupabaseClient } from "@/lib/supabase/server";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function errorResponse(message: string, status = 400) {
  return NextResponse.json({ status: false, message }, { status });
}

/**
 * The charged delivery fee split across shipments, to the pesewa.
 *
 * `fulfilment_allocations.delivery_fee` is numeric(12,2) and the customer's
 * receipt is these rows added up, so a plain `fee / shipments` on GH₵25 over
 * three branches stores 8.33 three times and leaves the receipt a pesewa short
 * of what was actually paid. The odd pesewas go to the first shipments.
 */
// Not exported: a route module may only export HTTP methods and segment
// config, so this is covered through the handler in route.test.ts.
function splitDeliveryFee(fee: number, shipments: number): number[] {
  if (shipments <= 0) return [];
  const pesewas = Number.isFinite(fee) ? Math.max(0, Math.round(fee * 100)) : 0;
  const share = Math.floor(pesewas / shipments);
  const remainder = pesewas - share * shipments;
  return Array.from(
    { length: shipments },
    (_, index) => (share + (index < remainder ? 1 : 0)) / 100,
  );
}

export async function POST(req: Request) {
  let orderId: string | null = null;
  let reservationId: string | null = null;

  try {
    const throttle = rateLimit(req, "paystack-initialize", 10, 60_000);
    if (!throttle.allowed) {
      return NextResponse.json(
        { status: false, message: "Too many payment attempts. Try again shortly." },
        { status: 429, headers: { "Retry-After": String(throttle.retryAfter) } },
      );
    }

    const body = await req.json();
    const { email, name, phone, deliveryAddress, shopId, preferredShopId, items, deliveryZoneId, fulfilmentType, promotionCode, voucherCode } = body as {
      email?: unknown;
      name?: unknown;
      phone?: unknown;
      deliveryAddress?: unknown;
      shopId?: unknown;
      preferredShopId?: unknown;
      items?: unknown;
      deliveryZoneId?: unknown;
      fulfilmentType?: unknown;
      promotionCode?: unknown;
      voucherCode?: unknown;
    };

    const chosenFulfilment = fulfilmentType === "pickup" ? "pickup" : "delivery";

    if (
      typeof email !== "string" ||
      !emailPattern.test(email) ||
      typeof name !== "string" ||
      !name.trim() ||
      typeof phone !== "string" ||
      typeof deliveryAddress !== "string" ||
      (chosenFulfilment === "delivery" && !deliveryAddress.trim()) ||
      (chosenFulfilment === "delivery" && typeof deliveryZoneId !== "string") ||
      (chosenFulfilment === "pickup" && typeof shopId !== "string") ||
      (shopId !== undefined && shopId !== null && typeof shopId !== "string") ||
      (preferredShopId !== undefined && preferredShopId !== null && typeof preferredShopId !== "string") ||
      (promotionCode !== undefined && promotionCode !== null && typeof promotionCode !== "string") ||
      (voucherCode !== undefined && voucherCode !== null && typeof voucherCode !== "string")
    ) {
      return errorResponse("Invalid checkout details.");
    }

    if (!isSupabaseAdminConfigured) {
      return errorResponse("Checkout is temporarily unavailable.", 503);
    }

    // Real enforcement for the "Store live" switch: the checkout page disables
    // its Pay button, but that is cosmetic — this is what actually refuses
    // money while the shop is getting ready. Checked before anything is
    // written, so no junk order or reservation is left behind.
    if (!(await isStoreReady())) {
      return errorResponse(STORE_NOT_READY_MESSAGE, 503);
    }

    // Checked before anything is written. `requireServerEnv` throws, and it is
    // only reached after the order row exists and stock is reserved — so an
    // unconfigured key produced a junk payment_failed order on every attempt
    // instead of a clean refusal.
    if (!process.env.PAYSTACK_SECRET_KEY) {
      return errorResponse("Card payment is temporarily unavailable.", 503);
    }

    const basket = await resolveCheckoutBasket({
      items: parseCheckoutItems(items),
      fulfilmentType: chosenFulfilment,
      pickupShopId: typeof shopId === "string" ? shopId : undefined,
      preferredShopId: typeof preferredShopId === "string" ? preferredShopId : undefined,
      deliveryZoneId: typeof deliveryZoneId === "string" ? deliveryZoneId : undefined,
    });
    const { products, variants: selectedVariants, inventory, allocation, merchandiseTotal, deliveryFee } = basket;
    const productIds = [...new Set(selectedVariants.map((variant) => variant.productId))];
    const authClient = await tryCreateServerSupabaseClient();
    const authData = authClient ? (await authClient.auth.getUser()).data : null;
    const promotionQuote = await quoteCheckoutPromotions({
      lines: selectedVariants.map((variant) => ({
        variantId: variant.id,
        productId: variant.productId,
        category: variant.productCategory,
        unitPrice: variant.price,
        quantity: variant.quantity,
      })),
      productIds,
      productCategories: Object.fromEntries(
        selectedVariants.map((variant) => [variant.productId, variant.productCategory]),
      ),
      deliveryFee,
      promotionCode: typeof promotionCode === "string" ? promotionCode : null,
      voucherCode: typeof voucherCode === "string" ? voucherCode : null,
      customerUserId: authData?.user?.id || null,
    });
    if (typeof promotionCode === "string" && promotionCode.trim() && !promotionQuote.promotionCodeValid) {
      return errorResponse(promotionQuote.promotionMessage || "That promotion code is not valid.");
    }
    if (typeof voucherCode === "string" && voucherCode.trim() && !promotionQuote.voucherCodeValid) {
      return errorResponse(promotionQuote.voucherMessage || "That gift voucher code is not valid.");
    }
    const total = promotionQuote.total;
    const amountInPesewas = Math.round(total * 100);
    if (!Number.isFinite(amountInPesewas) || amountInPesewas <= 0) return errorResponse("Invalid order total.");

    const primaryShopId = allocation.allocations[0].branchId;
    const orderNumber = `BB-${Date.now()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    const { data: order, error: orderError } = await supabaseAdmin
      .from("orders")
      .insert({
        order_number: orderNumber,
        customer_name: name.trim(),
        customer_email: email.trim().toLowerCase(),
        customer_phone: phone.trim(),
        customer_user_id: authData?.user?.id || null,
        delivery_address: chosenFulfilment === "delivery" ? deliveryAddress.trim() : "Click-and-collect",
        shop_id: primaryShopId,
        total_amount: total,
        voucher_code: typeof voucherCode === "string" && voucherCode.trim() ? voucherCode.trim() : null,
        voucher_credit: promotionQuote.voucherCredit || 0,
        order_status: "pending_payment",
        payment_method: "paystack",
        payment_status: "pending",
        order_type: "online",
      })
      .select("id, order_number")
      .single();
    if (orderError || !order) return errorResponse("Could not create the order.", 500);
    orderId = order.id;

    const productById = new Map(products.map((product) => [product.id, product]));
    const { data: insertedItems, error: itemError } = await supabaseAdmin
      .from("order_items")
      .insert(
        // `unit_price` and `total_price` are NOT NULL with no default on the
        // legacy order_items table. Omitting them made every single online
        // order fail here: the order row was created, this insert threw, and
        // the catch below marked the order payment_failed. Production has zero
        // order_items rows as a result.
        //
        // `price` and `cost_price` are what report_top_brands and
        // report_daily_profit read, so an order missing them reports zero brand
        // revenue and a 100% margin. Captured here, at the price actually
        // charged, rather than read back from the variant later.
        selectedVariants.map((variant) => ({
          order_id: order.id,
          product_id: variant.productId,
          variant_id: variant.id,
          product_name: productById.get(variant.productId)?.name || "Product",
          quantity: variant.quantity,
          unit_price: variant.price,
          total_price: Math.round(variant.price * variant.quantity * 100) / 100,
          price: variant.price,
          cost_price: variant.costPrice,
        })),
      )
      .select("id, product_id, variant_id");
    if (itemError || !insertedItems) throw new Error("Could not prepare order items.");

    if (promotionQuote.appliedPromotions.length > 0) {
      const rawDiscounts = promotionQuote.appliedPromotions.map((promotion) => {
        const base = promotion.eligibleSubtotal ?? merchandiseTotal;
        return promotion.kind === "percentage"
          ? base * (promotion.value / 100)
          : Math.min(base, promotion.value);
      });
      let remainingDiscount = promotionQuote.discount;
      const { error: appliedPromotionError } = await supabaseAdmin
        .from("applied_promotions")
        .insert(
          promotionQuote.appliedPromotions.map((promotion, index) => {
            const discountAmount = index === promotionQuote.appliedPromotions.length - 1
              ? remainingDiscount
              : Math.min(remainingDiscount, Math.round(rawDiscounts[index] * 100) / 100);
            remainingDiscount = Math.max(0, Math.round((remainingDiscount - discountAmount) * 100) / 100);
            return {
              order_id: order.id,
              promotion_id: promotion.promotionId,
              code: promotion.code,
              promotion_snapshot: {
                name: promotion.name,
                kind: promotion.kind,
                value: promotion.value,
                stackable: promotion.stackable,
                promotion_code_id: promotion.codeId,
                eligible_subtotal: promotion.eligibleSubtotal ?? null,
              },
              discount_amount: discountAmount,
            };
          }),
        );
      if (appliedPromotionError) throw new Error("Could not apply checkout promotion.");
    }

    const reservationItems = allocation.allocations.flatMap((branch) =>
      branch.items.map((item) => {
        const level = inventory.find(
          (candidate) => candidate.shop_id === branch.branchId && candidate.variant_id === item.variantId,
        );
        if (!level) throw new Error("Inventory allocation is incomplete.");
        return { inventory_level_id: level.id, quantity: item.quantity };
      }),
    );
    const { data: reservation, error: reservationError } = await supabaseAdmin.rpc("reserve_checkout", {
      p_items: reservationItems,
      p_order_id: order.id,
      p_user_id: authData?.user?.id || null,
      p_guest_token_hash: null,
    });
    if (reservationError || !reservation) throw new Error("Could not reserve inventory.");
    reservationId = reservation;

    // THE BUG: this used the basket's un-discounted `deliveryFee`, so a
    // free-delivery promotion zeroed the fee in the quote and in
    // `orders.total_amount` while the shipment rows still claimed the full
    // fee — and the customer's receipt, which adds these rows up, did not
    // match what they were charged. `promotionQuote.deliveryFee` is the fee
    // actually billed.
    const chargedDeliveryFee = chosenFulfilment === "delivery" ? promotionQuote.deliveryFee : 0;
    const deliveryFeeShares = splitDeliveryFee(chargedDeliveryFee, allocation.allocations.length);

    for (const [index, branch] of allocation.allocations.entries()) {
      const { data: fulfilment, error: fulfilmentError } = await supabaseAdmin
        .from("fulfilment_allocations")
        .insert({
          order_id: order.id,
          shop_id: branch.branchId,
          fulfilment_type: chosenFulfilment,
          status: "allocated",
          delivery_fee: deliveryFeeShares[index],
        })
        .select("id")
        .single();
      if (fulfilmentError || !fulfilment) throw new Error("Could not save fulfilment allocation.");

      const allocationItems = branch.items.map((item) => {
        const variant = selectedVariants.find((candidate) => candidate.id === item.variantId);
        const orderItem = insertedItems.find((candidate) => candidate.variant_id === variant?.id);
        if (!variant || !orderItem) throw new Error("Could not map fulfilment item.");
        return { allocation_id: fulfilment.id, order_item_id: orderItem.id, variant_id: variant.id, quantity: item.quantity };
      });
      const { error: allocationError } = await supabaseAdmin.from("fulfilment_allocation_items").insert(allocationItems);
      if (allocationError) throw new Error("Could not save fulfilment items.");
    }

    const res = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${requireServerEnv("PAYSTACK_SECRET_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email,
        amount: amountInPesewas,
        currency: "GHS",
        channels: ["card", "mobile_money", "bank_transfer"],
        metadata: { name, phone, order_id: order.id, order_number: order.order_number, reservation_id: reservationId },
      }),
    });
    const data = await res.json();
    if (!res.ok || !data?.status || !data?.data?.access_code || !data?.data?.reference) {
      await supabaseAdmin.rpc("release_checkout_reservation", { p_reservation_id: reservationId });
      await supabaseAdmin.from("applied_promotions").delete().eq("order_id", order.id);
      await supabaseAdmin.from("orders").update({ order_status: "payment_failed", payment_status: "failed" }).eq("id", order.id);
      return errorResponse(data?.message || "Payment initialization failed.", 502);
    }
    const reference: string = data.data.reference;
    const accessCode: string = data.data.access_code;

    await Promise.all([
      supabaseAdmin.from("orders").update({ payment_reference: reference }).eq("id", order.id),
      supabaseAdmin.from("payment_attempts").insert({
        order_id: order.id,
        provider: "paystack",
        provider_reference: reference,
        amount: total,
        currency: "GHS",
        status: "initialized",
      }),
    ]);

    return NextResponse.json({
      status: true,
      data: {
        access_code: accessCode,
        reference,
        order_id: order.id,
        order_number: order.order_number,
        split: allocation.split,
        shipment_count: allocation.allocations.length,
        delivery_fee: promotionQuote.deliveryFee,
        discount: promotionQuote.discount,
        total: promotionQuote.total,
        promotion_message: promotionQuote.promotionMessage,
      },
    });
  } catch (error) {
    if (reservationId) {
      await supabaseAdmin.rpc("release_checkout_reservation", { p_reservation_id: reservationId });
    }
    if (orderId) {
      await supabaseAdmin.from("applied_promotions").delete().eq("order_id", orderId);
      await supabaseAdmin.from("orders").update({ order_status: "payment_failed", payment_status: "failed" }).eq("id", orderId);
    }
    if (error instanceof CheckoutResolutionError) {
      return errorResponse(error.message, error.status);
    }
    // The customer still gets a generic message — the cause of a failed payment
    // must not leak to the browser. But it has to reach the server logs, or a
    // checkout that 500s is undiagnosable in production.
    console.error("[paystack/initialize] failed", {
      orderId,
      reservationId,
      error: error instanceof Error ? error.message : String(error),
    });
    return errorResponse("Payment initialization failed.", 500);
  }
}
