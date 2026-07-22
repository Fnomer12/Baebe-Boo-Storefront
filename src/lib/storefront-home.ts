import "server-only";

import { isSupabaseAdminConfigured, supabaseAdmin } from "@/lib/supabase-admin";

export async function loadStorefrontHomeData() {
  if (!isSupabaseAdminConfigured) {
    return { products: [], shops: [], bestSellerIds: [] };
  }

  const [productResult, shopResult, bestSellerResult] = await Promise.all([
    supabaseAdmin
      .from("products")
      .select("id,name,category,age_range,gender,price,image_url")
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(100),
    supabaseAdmin
      .from("shops")
      .select("id,name,location")
      .eq("is_active", true)
      .order("created_at", { ascending: true }),
    supabaseAdmin.rpc("get_best_selling_products", { p_limit: 4 }),
  ]);
  const products = productResult.error ? [] : productResult.data ?? [];
  const bestSellerIds = bestSellerResult.error
    ? []
    : (bestSellerResult.data ?? []).map(
        (entry: { product_id: string }) => entry.product_id,
      );
  const loadedIds = new Set(products.map((product) => product.id));
  const missingIds = bestSellerIds.filter((id: string) => !loadedIds.has(id));
  if (missingIds.length) {
    const missingResult = await supabaseAdmin
      .from("products")
      .select("id,name,category,age_range,gender,price,image_url")
      .in("id", missingIds)
      .eq("is_active", true);
    if (!missingResult.error && missingResult.data) products.push(...missingResult.data);
  }

  return {
    products,
    shops: shopResult.error ? [] : shopResult.data ?? [],
    bestSellerIds,
  };
}
