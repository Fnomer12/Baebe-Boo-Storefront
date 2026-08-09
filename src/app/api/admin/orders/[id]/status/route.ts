import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeAdminApi } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

const statusSchema = z.object({
  status: z.enum([
    "payment_failed",
    "received",
    "processing",
    "on_hold",
    "dispatched",
    "shipped",
    "delivered",
    "completed",
    "cancelled",
    "refunded",
  ]),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authorization = await authorizeAdminApi("orders:write");
  if (!authorization.authorized) return authorization.response;
  const input = statusSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) {
    return NextResponse.json({ message: "Invalid order status." }, { status: 400 });
  }

  const { id } = await params;
  const { error } = await supabaseAdmin.rpc("transition_order", {
    p_order_id: id,
    p_next_status: input.data.status,
  });

  if (error) {
    return NextResponse.json(
      { message: error.message || "Could not update the order." },
      { status: 409 },
    );
  }

  return NextResponse.json({ status: input.data.status });
}
