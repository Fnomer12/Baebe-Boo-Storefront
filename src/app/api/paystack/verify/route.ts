import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { rateLimit } from "@/lib/rate-limit";

export async function POST(req: Request) {
  try {
    const throttle = rateLimit(req, "paystack-verify", 20, 60_000);
    if (!throttle.allowed) {
      return NextResponse.json(
        { status: false, message: "Too many verification attempts. Try again shortly." },
        { status: 429, headers: { "Retry-After": String(throttle.retryAfter) } }
      );
    }

    const { reference, orderId } = await req.json();

    if (
      typeof reference !== "string" ||
      !reference.trim() ||
      typeof orderId !== "string" ||
      !orderId.trim()
    ) {
      return NextResponse.json(
        { status: false, message: "Invalid payment verification request." },
        { status: 400 }
      );
    }

    const { data: order, error: orderError } = await supabaseAdmin
      .from("orders")
      .select("id, total_amount, payment_reference, payment_status")
      .eq("id", orderId)
      .maybeSingle();

    if (orderError || !order || order.payment_reference !== reference) {
      return NextResponse.json(
        { status: false, message: "Payment does not match an order." },
        { status: 400 }
      );
    }

    if (order.payment_status === "paid") {
      return NextResponse.json({ status: true, reference, order_id: order.id });
    }

    const res = await fetch(
      `https://api.paystack.co/transaction/verify/${reference}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        },
      }
    );

    const data = await res.json();

    const paidAmount = Number(data?.data?.amount || 0);
    const expectedAmount = Math.round(Number(order.total_amount) * 100);

    if (
      data?.status === true &&
      data?.data?.status === "success" &&
      paidAmount === expectedAmount
    ) {
      const { error: updateError } = await supabaseAdmin.rpc(
        "finalize_paid_order",
        { p_order_id: order.id }
      );

      if (updateError) {
        return NextResponse.json(
          { status: false, message: "Could not finalize the order." },
          { status: 500 }
        );
      }

      return NextResponse.json({ status: true, reference, order_id: order.id });
    }

    return NextResponse.json({
      status: false,
      message: "Payment not verified",
    });
  } catch {
    return NextResponse.json(
      { status: false, message: "Payment verification failed" },
      { status: 500 }
    );
  }
}
