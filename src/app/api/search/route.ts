import { NextResponse } from "next/server";
import { isSupabaseAdminConfigured, supabaseAdmin } from "@/lib/supabase-admin";
import { catalogProductFromRow, type PublicCatalogRow } from "@/components/storefront/catalog-data";

// Realtime product search backing the storefront instant-search widgets.
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const raw = (searchParams.get("q") || "").trim();
  // Strip characters that would break the PostgREST or() filter syntax, then cap length.
  const safe = raw.replace(/[,()%*\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);

  if (safe.length < 2 || !isSupabaseAdminConfigured) {
    return NextResponse.json({ results: [] });
  }

  const pattern = `%${safe}%`;
  const { data, error } = await supabaseAdmin
    .from("products")
    .select("id,name,category,age_range,gender,price,image_url")
    .eq("is_active", true)
    .or(`name.ilike.${pattern},category.ilike.${pattern}`)
    .limit(8);

  if (error || !data) {
    return NextResponse.json({ results: [] });
  }

  const results = (data as PublicCatalogRow[])
    .map(catalogProductFromRow)
    .filter((product): product is NonNullable<ReturnType<typeof catalogProductFromRow>> => Boolean(product))
    .map((product) => ({
      id: product.id,
      name: product.name,
      slug: product.slug,
      category: product.category,
      price: product.price,
      imageUrl: product.imageUrl,
    }));

  return NextResponse.json({ results });
}
