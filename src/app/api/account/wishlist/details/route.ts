import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) {
      return NextResponse.json({ items: [] }, { status: 401 });
    }

    const { data, error } = await supabase
      .from("wishlists")
      .select(
        `id, name, is_public,
        wishlist_items!inner(product_id, products(id, name, price, image_url))`,
      )
      .eq("user_id", authData.user.id);

    if (error) {
      return NextResponse.json({ items: [] }, { status: 503 });
    }

    type EmbeddedProduct = { id: string; name: string; price: number; image_url: string | null };
    const items = (data ?? []).flatMap((wishlist) => {
      const wishlistItems = (wishlist.wishlist_items ?? []) as unknown as Array<{
        product_id: string;
        // A to-one embed through the product_id FK arrives as an object, not
        // an array — indexing it with [0] made every product resolve to null.
        products: EmbeddedProduct | EmbeddedProduct[] | null;
      }>;
      return wishlistItems.map((item) => {
        const product = Array.isArray(item.products)
          ? item.products[0] ?? null
          : item.products;
        return {
          wishlistId: wishlist.id,
          productId: item.product_id,
          id: item.product_id,
          name: product?.name ?? "Product",
          price: product?.price ?? 0,
          imageUrl: product?.image_url ?? null,
        };
      });
    });

    return NextResponse.json({ items });
  } catch {
    return NextResponse.json({ items: [] }, { status: 503 });
  }
}
