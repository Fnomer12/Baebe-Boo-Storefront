import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) {
      return NextResponse.json({ orders: [] }, { status: 401 });
    }

    const { data, error } = await supabase
      .from("orders")
      .select(
        `id, order_number, total_amount, order_status, payment_status, created_at,
        order_items(id, product_id, product_name, quantity, unit_price, total_price)`,
      )
      .eq("customer_user_id", authData.user.id)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ orders: [] }, { status: 503 });
    }

    return NextResponse.json({ orders: data ?? [] });
  } catch {
    return NextResponse.json({ orders: [] }, { status: 503 });
  }
}
