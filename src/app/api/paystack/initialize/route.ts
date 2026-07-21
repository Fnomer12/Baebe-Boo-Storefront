import { NextResponse } from "next/server";
import { allocateInventory } from "@/domain/commerce/allocation";
import { quoteCheckoutPromotions } from "@/lib/checkout/promotions";
import { rateLimit } from "@/lib/rate-limit";
import { requireServerEnv } from "@/lib/server-env";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type CheckoutItem = { productId: string; quantity: number };
type ProductRow = { id: string; name: string; price: number | string };
type VariantRow = {
  id: string;
  product_id: string;
  price: number | string;
  is_default: boolean;
  is_active: boolean;
};
type InventoryRow = {
  id: string;
  variant_id: string;
  shop_id: string;
  on_hand: number;
  reserved: number;
};

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
    const { email, name, phone, deliveryAddress, shopId, items, deliveryZoneId, fulfilmentType, promotionCode } = body as {
      email?: unknown;
      name?: unknown;
      phone?: unknown;
      deliveryAddress?: unknown;
      shopId?: unknown;
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
      (promotionCode !== undefined && promotionCode !== null && typeof promotionCode !== "string") ||
      (typeof promotionCode === "string" && promotionCode.trim().length > 64) ||
      !Array.isArray(items) ||
      items.length === 0 ||
      items.length > 50
    ) {
      return errorResponse("Invalid checkout details.");
    }

    const quantities = new Map<string, number>();
    for (const item of items as CheckoutItem[]) {
      if (
        !item ||
        typeof item.productId !== "string" ||
        !Number.isInteger(item.quantity) ||
        item.quantity < 1 ||
        item.quantity > 100
      ) {
        return errorResponse("Invalid cart item.");
      }
      quantities.set(item.productId, (quantities.get(item.productId) || 0) + item.quantity);
    }

    const productIds = [...quantities.keys()];
    const [{ data: productsData, error: productError }, { data: variantsData, error: variantError }] =
      await Promise.all([
        supabaseAdmin.from("products").select("id, name, price").in("id", productIds).eq("is_active", true),
        supabaseAdmin.from("product_variants").select("id, product_id, price, is_default, is_active").in("product_id", productIds).eq("is_active", true),
      ]);

    const products = (productsData || []) as ProductRow[];
    const variants = (variantsData || []) as VariantRow[];
    if (productError || variantError || products.length !== productIds.length) {
      return errorResponse("One or more products are no longer available.", 409);
    }

    const selectedVariants = productIds.map((productId) => {
      const candidates = variants.filter((variant) => variant.product_id === productId);
      return candidates.find((variant) => variant.is_default) || candidates[0];
    });
    if (selectedVariants.some((variant) => !variant)) {
      return errorResponse("One or more product options are unavailable.", 409);
    }

    const variantIds = selectedVariants.map((variant) => variant.id);
    const { data: inventoryData, error: inventoryError } = await supabaseAdmin
      .from("inventory_levels")
      .select("id, variant_id, shop_id, on_hand, reserved")
      .in("variant_id", variantIds);
    if (inventoryError) return errorResponse("Could not check current inventory.", 503);

    const allInventory = (inventoryData || []) as InventoryRow[];
    const inventory = typeof shopId === "string"
      ? allInventory.filter((level) => level.shop_id === shopId)
      : allInventory;
    const branchIds = [...new Set(inventory.map((level) => level.shop_id))];
    const branchStock = branchIds.map((branchId) => ({
      branchId,
      stock: Object.fromEntries(
        inventory
          .filter((level) => level.shop_id === branchId)
          .map((level) => [level.variant_id, Math.max(0, Number(level.on_hand) - Number(level.reserved))]),
      ),
    }));
    const requestedLines = selectedVariants.map((variant) => ({
      variantId: variant.id,
      quantity: quantities.get(variant.product_id) || 0,
    }));
    const allocation = allocateInventory(requestedLines, branchStock);
    if (allocation.status === "insufficient_stock") {
      return NextResponse.json(
        { status: false, message: "One or more items no longer have enough stock.", shortages: allocation.shortages },
        { status: 409 },
      );
    }

    if (chosenFulfilment === "pickup" && allocation.split) {
      return errorResponse("Click-and-collect requires one branch to hold the full cart.", 409);
    }

    const merchandiseTotal = selectedVariants.reduce(
      (sum, variant) => sum + Number(variant.price) * (quantities.get(variant.product_id) || 0),
      0,
    );
    let deliveryFee = 0;
    if (chosenFulfilment === "delivery" && typeof deliveryZoneId === "string") {
      const { data: zone, error: zoneError } = await supabaseAdmin
        .from("delivery_zones")
        .select("base_fee, free_delivery_threshold")
        .eq("id", deliveryZoneId)
        .eq("is_active", true)
        .maybeSingle();
      if (zoneError || !zone) return errorResponse("Choose a valid delivery zone.");
      const qualifiesForFreeDelivery = zone.free_delivery_threshold !== null && merchandiseTotal >= Number(zone.free_delivery_threshold);
      deliveryFee = qualifiesForFreeDelivery ? 0 : Number(zone.base_fee) * allocation.allocations.length;
    }
    const authClient = await createServerSupabaseClient();
    const { data: authData } = await authClient.auth.getUser();
    const promotionQuote = await quoteCheckoutPromotions({
      lines: selectedVariants.map((variant) => ({
        variantId: variant.id,
        unitPrice: Number(variant.price),
        quantity: quantities.get(variant.product_id) || 0,
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
          product_id: variant.product_id,
          product_name: productById.get(variant.product_id)?.name || "Product",
          quantity: quantities.get(variant.product_id) || 0,
        })),
      )
      .select("id, product_id");
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
        const orderItem = insertedItems.find((candidate) => candidate.product_id === variant?.product_id);
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
  } catch {
    if (reservationId) {
      await supabaseAdmin.rpc("release_checkout_reservation", { p_reservation_id: reservationId });
    }
    if (orderId) {
      await supabaseAdmin.from("applied_promotions").delete().eq("order_id", orderId);
      await supabaseAdmin.from("orders").update({ order_status: "payment_failed", payment_status: "failed" }).eq("id", orderId);
    }
    return errorResponse("Payment initialization failed.", 500);
  }
}
