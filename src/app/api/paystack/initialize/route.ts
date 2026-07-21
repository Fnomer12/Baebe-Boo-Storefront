import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { rateLimit } from "@/lib/rate-limit";

type CheckoutItem = { productId: string; quantity: number };

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function errorResponse(message: string, status = 400) {
  return NextResponse.json({ status: false, message }, { status });
}

export async function POST(req: Request) {
  try {
    const throttle = rateLimit(req, "paystack-initialize", 10, 60_000);
    if (!throttle.allowed) {
      return NextResponse.json(
        { status: false, message: "Too many payment attempts. Try again shortly." },
        { status: 429, headers: { "Retry-After": String(throttle.retryAfter) } }
      );
    }

    const body = await req.json();
    const { email, name, phone, deliveryAddress, shopId, items } = body as {
      email?: unknown;
      name?: unknown;
      phone?: unknown;
      deliveryAddress?: unknown;
      shopId?: unknown;
      items?: unknown;
    };

    if (
      typeof email !== "string" ||
      !emailPattern.test(email) ||
      typeof name !== "string" ||
      !name.trim() ||
      typeof phone !== "string" ||
      typeof deliveryAddress !== "string" ||
      !deliveryAddress.trim() ||
      typeof shopId !== "string" ||
      !Array.isArray(items) ||
      items.length === 0 ||
      items.length > 50
    ) {
      return errorResponse("Invalid checkout details.");
    }

    const checkoutItems = items as CheckoutItem[];
    const quantities = new Map<string, number>();

    for (const item of checkoutItems) {
      if (
        !item ||
        typeof item.productId !== "string" ||
        !Number.isInteger(item.quantity) ||
        item.quantity < 1 ||
        item.quantity > 100
      ) {
        return errorResponse("Invalid cart item.");
      }

      quantities.set(
        item.productId,
        (quantities.get(item.productId) || 0) + item.quantity
      );
    }

    const productIds = [...quantities.keys()];
    const [{ data: shop, error: shopError }, { data: products, error: productError }, { data: availability, error: availabilityError }] =
      await Promise.all([
        supabaseAdmin
          .from("shops")
          .select("id, name, location")
          .eq("id", shopId)
          .eq("is_active", true)
          .maybeSingle(),
        supabaseAdmin
          .from("products")
          .select("id, name, price, is_active")
          .in("id", productIds)
          .eq("is_active", true),
        supabaseAdmin
          .from("product_shop_availability")
          .select("product_id, stock_quantity, is_available")
          .eq("shop_id", shopId)
          .in("product_id", productIds)
          .eq("is_available", true),
      ]);

    if (shopError || !shop || productError || availabilityError) {
      return errorResponse("Could not validate the selected store.", 500);
    }

    if (!products || products.length !== productIds.length) {
      return errorResponse("One or more products are no longer available.");
    }

    const stockByProduct = new Map(
      (availability || []).map((row) => [row.product_id, Number(row.stock_quantity)])
    );

    for (const [productId, quantity] of quantities) {
      if ((stockByProduct.get(productId) || 0) < quantity) {
        return errorResponse("One or more products no longer have enough stock.");
      }
    }

    const total = products.reduce(
      (sum, product) => sum + Number(product.price) * (quantities.get(product.id) || 0),
      0
    );
    const amountInPesewas = Math.round(total * 100);

    if (!Number.isFinite(amountInPesewas) || amountInPesewas <= 0) {
      return errorResponse("Invalid order total.");
    }

    const orderNumber = `BB-${Date.now()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    const { data: order, error: orderError } = await supabaseAdmin
      .from("orders")
      .insert({
        order_number: orderNumber,
        customer_name: name.trim(),
        customer_email: email.trim().toLowerCase(),
        customer_phone: phone.trim(),
        delivery_address: deliveryAddress.trim(),
        shop_id: shopId,
        total_amount: total,
        order_status: "pending_payment",
        payment_method: "paystack",
        payment_status: "pending",
        order_type: "online",
      })
      .select("id, order_number")
      .single();

    if (orderError || !order) {
      return errorResponse("Could not create the order.", 500);
    }

    const orderItems = products.map((product) => ({
      order_id: order.id,
      product_id: product.id,
      product_name: product.name,
      quantity: quantities.get(product.id) || 0,
    }));

    const { error: itemError } = await supabaseAdmin
      .from("order_items")
      .insert(orderItems);

    if (itemError) {
      await supabaseAdmin.from("orders").delete().eq("id", order.id);
      return errorResponse("Could not prepare the order.", 500);
    }

    const res = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email,
        amount: amountInPesewas,
        currency: "GHS",
        metadata: {
          name,
          phone,
          order_id: order.id,
        },
      }),
    });

    const data = await res.json();

    if (!res.ok || !data?.status || !data?.data?.access_code || !data?.data?.reference) {
      await supabaseAdmin
        .from("orders")
        .update({ order_status: "payment_failed", payment_status: "failed" })
        .eq("id", order.id);
      return errorResponse(data?.message || "Payment initialization failed.", 502);
    }

    await supabaseAdmin
      .from("orders")
      .update({ payment_reference: data.data.reference })
      .eq("id", order.id);

    return NextResponse.json({
      status: true,
      data: {
        access_code: data.data.access_code,
        reference: data.data.reference,
        order_id: order.id,
        order_number: order.order_number,
      },
    });
  } catch {
    return errorResponse("Payment initialization failed.", 500);
  }
}
