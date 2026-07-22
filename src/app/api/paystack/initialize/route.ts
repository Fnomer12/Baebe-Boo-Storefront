import { NextResponse } from "next/server";
import { quoteCheckoutPromotions } from "@/lib/checkout/promotions";
import {
  CheckoutResolutionError,
  parseCheckoutItems,
  resolveCheckoutBasket,
} from "@/lib/checkout/resolve-basket";
import { rateLimit } from "@/lib/rate-limit";
import { requireServerEnv } from "@/lib/server-env";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function errorResponse(message: string, status = 400) {
  return NextResponse.json({ status: false, message }, { status });
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
    const { email, name, phone, deliveryAddress, shopId, preferredShopId, items, deliveryZoneId, fulfilmentType, promotionCode } = body as {
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
      (promotionCode !== undefined && promotionCode !== null && typeof promotionCode !== "string")
    ) {
      return errorResponse("Invalid checkout details.");
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
    const authClient = await createServerSupabaseClient();
    const { data: authData } = await authClient.auth.getUser();
    const promotionQuote = await quoteCheckoutPromotions({
      lines: selectedVariants.map((variant) => ({
        variantId: variant.id,
        unitPrice: variant.price,
        quantity: variant.quantity,
      })),
      productIds,
      deliveryFee,
      promotionCode: typeof promotionCode === "string" ? promotionCode : null,
      customerUserId: authData.user?.id || null,
    });
    if (typeof promotionCode === "string" && promotionCode.trim() && !promotionQuote.promotionCodeValid) {
      return errorResponse(promotionQuote.promotionMessage || "That promotion code is not valid.");
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
        customer_user_id: authData.user?.id || null,
        delivery_address: chosenFulfilment === "delivery" ? deliveryAddress.trim() : "Click-and-collect",
        shop_id: primaryShopId,
        total_amount: total,
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
        selectedVariants.map((variant) => ({
          order_id: order.id,
          product_id: variant.productId,
          variant_id: variant.id,
          product_name: productById.get(variant.productId)?.name || "Product",
          quantity: variant.quantity,
        })),
      )
      .select("id, product_id, variant_id");
    if (itemError || !insertedItems) throw new Error("Could not prepare order items.");

    if (promotionQuote.appliedPromotions.length > 0) {
      const rawDiscounts = promotionQuote.appliedPromotions.map((promotion) =>
        promotion.kind === "percentage"
          ? merchandiseTotal * (promotion.value / 100)
          : promotion.value,
      );
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
      p_user_id: authData.user?.id || null,
      p_guest_token_hash: null,
    });
    if (reservationError || !reservation) throw new Error("Could not reserve inventory.");
    reservationId = reservation;

    for (const branch of allocation.allocations) {
      const { data: fulfilment, error: fulfilmentError } = await supabaseAdmin
        .from("fulfilment_allocations")
        .insert({
          order_id: order.id,
          shop_id: branch.branchId,
          fulfilment_type: chosenFulfilment,
          status: "allocated",
          delivery_fee: chosenFulfilment === "delivery" ? deliveryFee / allocation.allocations.length : 0,
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

    await Promise.all([
      supabaseAdmin.from("orders").update({ payment_reference: data.data.reference }).eq("id", order.id),
      supabaseAdmin.from("payment_attempts").insert({
        order_id: order.id,
        provider: "paystack",
        provider_reference: data.data.reference,
        amount: total,
        currency: "GHS",
        status: "initialized",
      }),
    ]);

    return NextResponse.json({
      status: true,
      data: {
        access_code: data.data.access_code,
        reference: data.data.reference,
        order_id: order.id,
        order_number: order.order_number,
        split: allocation.split,
        shipment_count: allocation.allocations.length,
        delivery_fee: deliveryFee,
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
    return errorResponse("Payment initialization failed.", 500);
  }
}
