import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { isSupabaseAdminConfigured, supabaseAdmin } from "@/lib/supabase-admin";
import { requireServerEnv } from "@/lib/server-env";
import { finalizeVerifiedOrder } from "@/lib/orders/finalize-paid-order";

function signaturesMatch(rawBody: string, signature: string) {
  const expected = createHmac("sha512", requireServerEnv("PAYSTACK_SECRET_KEY"))
    .update(rawBody)
    .digest("hex");
  const expectedBuffer = Buffer.from(expected, "utf8");
  const suppliedBuffer = Buffer.from(signature, "utf8");

  return (
    expectedBuffer.length === suppliedBuffer.length &&
    timingSafeEqual(expectedBuffer, suppliedBuffer)
  );
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-paystack-signature") || "";

  let validSignature = false;
  try {
    validSignature = Boolean(signature) && signaturesMatch(rawBody, signature);
  } catch {
    return NextResponse.json({ received: false }, { status: 503 });
  }

  if (!validSignature) {
    return NextResponse.json({ received: false }, { status: 401 });
  }

  if (!isSupabaseAdminConfigured) {
    return NextResponse.json({ received: false }, { status: 503 });
  }

  try {
    const event = JSON.parse(rawBody) as {
      event?: string;
      data?: {
        reference?: string;
        status?: string;
        amount?: number;
        currency?: string;
        metadata?: { order_id?: string };
      };
    };

    if (event.event !== "charge.success" || event.data?.status !== "success") {
      return NextResponse.json({ received: true });
    }

    const reference = event.data.reference;
    const orderId = event.data.metadata?.order_id;

    if (!reference) {
      return NextResponse.json({ received: false }, { status: 400 });
    }

    const query = supabaseAdmin
      .from("orders")
      .select("id, total_amount, payment_status")
      .eq("payment_reference", reference);
    const { data: order, error } = orderId
      ? await query.eq("id", orderId).maybeSingle()
      : await query.maybeSingle();

    if (error || !order) {
      return NextResponse.json({ received: false }, { status: 404 });
    }

    if (order.payment_status === "paid") {
      return NextResponse.json({ received: true });
    }

    const expectedAmount = Math.round(Number(order.total_amount) * 100);
    if (
      Number(event.data.amount) !== expectedAmount ||
      event.data.currency !== "GHS" ||
      (orderId && orderId !== order.id)
    ) {
      return NextResponse.json({ received: false }, { status: 400 });
    }

    const { error: finalizeError } = await finalizeVerifiedOrder(order.id, reference);

    if (finalizeError) {
      return NextResponse.json({ received: false }, { status: 500 });
    }

    return NextResponse.json({ received: true });
  } catch {
    return NextResponse.json({ received: false }, { status: 400 });
  }
}
