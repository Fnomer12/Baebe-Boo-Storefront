import { NextResponse } from "next/server";
import { authorizeAdminApi } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function GET() {
  const authorization = await authorizeAdminApi("orders:read");
  if (!authorization.authorized) return authorization.response;

  const { data, error } = await supabaseAdmin
    .from("orders")
    .select("id, order_number, customer_name, customer_email, customer_phone, total_amount, payment_status, order_status, order_type, created_at, updated_at")
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ message: "Orders could not be loaded." }, { status: 500 });
  return NextResponse.json({ orders: (data || []).map((order) => ({
    id: order.id,
    orderNumber: order.order_number,
    customerName: order.customer_name,
    customerEmail: order.customer_email,
    customerPhone: order.customer_phone,
    totalAmount: Number(order.total_amount || 0),
    paymentStatus: order.payment_status,
    status: order.order_status,
    orderType: order.order_type,
    createdAt: order.created_at,
    updatedAt: order.updated_at,
  })) });
}
