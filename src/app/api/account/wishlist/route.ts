import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeCustomerMutation } from "@/lib/account/customer-api";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const mutationSchema = z.object({ productId: z.uuid(), active: z.boolean() });

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) return NextResponse.json({ productIds: [] });
    const { data, error } = await supabase
      .from("wishlists")
      .select("wishlist_items(product_id)")
      .eq("user_id", authData.user.id);
    if (error) return NextResponse.json({ message: "Could not load your wishlist." }, { status: 503 });
    const productIds = (data || []).flatMap((wishlist) =>
      (wishlist.wishlist_items || []).map((item) => item.product_id),
    );
    return NextResponse.json({ productIds: [...new Set(productIds)] });
  } catch {
    return NextResponse.json({ productIds: [] });
  }
}

export async function POST(request: Request) {
  const authorization = await authorizeCustomerMutation(request, "wishlist", 30);
  if (!authorization.authorized) return authorization.response;
  const parsed = mutationSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: "Invalid wishlist item." }, { status: 400 });

  const { supabase, userId } = authorization;
  let { data: wishlist, error } = await supabase
    .from("wishlists")
    .select("id")
    .eq("user_id", userId)
    .eq("name", "My wishlist")
    .maybeSingle();
  if (!wishlist && !error && parsed.data.active) {
    const created = await supabase
      .from("wishlists")
      .insert({ user_id: userId, name: "My wishlist", is_public: false })
      .select("id")
      .single();
    wishlist = created.data;
    error = created.error;
  }
  if (error || (!wishlist && parsed.data.active)) {
    return NextResponse.json({ message: "Could not update your wishlist." }, { status: 409 });
  }
  if (!wishlist) return NextResponse.json({ active: false });

  const result = parsed.data.active
    ? await supabase.from("wishlist_items").upsert({ wishlist_id: wishlist.id, product_id: parsed.data.productId }, { onConflict: "wishlist_id,product_id" })
    : await supabase.from("wishlist_items").delete().eq("wishlist_id", wishlist.id).eq("product_id", parsed.data.productId);
  if (result.error) return NextResponse.json({ message: "Could not update your wishlist." }, { status: 409 });
  return NextResponse.json({ active: parsed.data.active });
}
