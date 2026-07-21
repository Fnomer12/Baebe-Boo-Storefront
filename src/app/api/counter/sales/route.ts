import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCounter } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const saleSchema = z.object({
  items: z.array(z.object({ productId: z.uuid(), quantity: z.int().min(1).max(100) })).min(1).max(50),
  paymentMethod: z.enum(["cash", "visa", "momo"]),
  customerName: z.string().trim().max(120).optional(),
  customerPhone: z.string().trim().max(24).optional(),
});

export async function POST(request: Request) {
  const authorization = await requireCounter();
  const input = saleSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) return NextResponse.json({ message: "Invalid counter sale." }, { status: 400 });

  const supabase = await createServerSupabaseClient();
  const productIds = [...new Set(input.data.items.map((item) => item.productId))];
  const { data: variants, error: variantError } = await supabase
    .from("product_variants")
    .select("id, product_id, is_default")
    .in("product_id", productIds)
    .eq("is_active", true);
  if (variantError || !variants) return NextResponse.json({ message: "Could not validate product options." }, { status: 409 });

  const rpcItems = input.data.items.map((item) => {
    const candidates = variants.filter((variant) => variant.product_id === item.productId);
    const variant = candidates.find((candidate) => candidate.is_default) || candidates[0];
    return variant ? { variant_id: variant.id, quantity: item.quantity } : null;
  });
  if (rpcItems.some((item) => !item)) return NextResponse.json({ message: "A product has no sellable option." }, { status: 409 });

  const { data, error } = await supabase.rpc("complete_counter_sale", {
    p_staff_id: authorization.staff.id,
    p_items: rpcItems,
    p_payment_method: input.data.paymentMethod,
    p_customer_name: input.data.customerName || "Walk-in Customer",
    p_customer_phone: input.data.customerPhone || "",
  });
  if (error) return NextResponse.json({ message: error.message || "Could not complete sale." }, { status: 409 });

  const sale = Array.isArray(data) ? data[0] : data;
  return NextResponse.json({ sale });
}
