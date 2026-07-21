import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { rateLimit } from "@/lib/rate-limit";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  const throttle = rateLimit(request, "order-track", 20, 60_000);
  if (!throttle.allowed) {
    return NextResponse.json(
      { message: "Too many lookup attempts. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(throttle.retryAfter) } }
    );
  }

  const body = await request.json().catch(() => ({}));
  const orderNumber = typeof body.orderNumber === "string" ? body.orderNumber.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";

  if (!orderNumber || !emailPattern.test(email)) {
    return NextResponse.json({ message: "Enter a valid order number and email." }, { status: 400 });
  }

  const { data: order, error } = await supabaseAdmin
    .from("orders")
    .select(
      "id, record_code, order_number, customer_name, total_amount, delivery_address, digital_address, order_status, shipping_status, shipped_at, delivered_at, created_at"
    )
    .eq("order_number", orderNumber)
    .eq("customer_email", email)
    .maybeSingle();

  if (error || !order) {
    return NextResponse.json({ message: "Order not found." }, { status: 404 });
  }

  return NextResponse.json({ orders: [order] });
}
