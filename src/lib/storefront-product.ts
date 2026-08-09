import "server-only";

import { cache } from "react";
import { priceRange } from "@/domain/catalog/variant-selection";
import { deriveVariantOptions } from "@/domain/catalog/variant-options";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  catalogProductFromRow,
  fallbackProducts,
  findProduct,
  slugify,
  type StorefrontProduct,
  type StorefrontVariant,
} from "@/components/storefront/catalog-data";

type ProductRow = {
  id: string;
  name: string | null;
  category: string | null;
  age_range: string | null;
  gender: string | null;
  price: number | string | null;
  image_url: string | null;
  description: string | null;
  /** `products.options`, jsonb. Absent until the variable-products migration runs. */
  options?: unknown;
};

type VariantRow = {
  id: string;
  title: string;
  option_values: unknown;
  price: number | string;
  compare_at_price: number | string | null;
  is_default: boolean;
};

type MediaRow = {
  media_type: "image" | "video" | "model_3d";
  url: string;
  alt_text: string | null;
  /** Set when a photo belongs to one version. Absent until the migration runs. */
  variant_id?: string | null;
};

/**
 * Columns that exist today, and the ones the variable-products migration adds.
 *
 * PostgREST rejects the WHOLE query when a selected column does not exist, so
 * asking for `options` on a database that has not been migrated would empty
 * the product page rather than degrade. Every read here tries the richer list
 * and falls back — the storefront must not wait on a migration.
 *
 * `cost_price` and `barcode` are missing on purpose: they are excluded from the
 * anon grant, and naming either one fails the query for every shopper.
 */
const productColumns = "id,name,category,age_range,gender,price,image_url,description";
const mediaColumns = "media_type,url,alt_text";

export type PublicProductReview = {
  id: string;
  rating: number;
  title: string | null;
  body: string | null;
  publishedAt: string | null;
  verified: boolean;
};

export const listStorefrontProducts = cache(async (): Promise<StorefrontProduct[]> => {
  try {
    const supabase = await createServerSupabaseClient();
    const listing = (columns: string) =>
      supabase.from("products").select(columns).eq("is_active", true).order("created_at", { ascending: false });
    // The embed prices a variable product from its cheapest live version. If the
    // relationship is unavailable the listing still renders, at the product price.
    const withVariants = await listing(`${productColumns},product_variants(price,is_active)`);
    const { data, error } = withVariants.error ? await listing(productColumns) : withVariants;
    if (error) return [];
    // A runtime column list defeats the client's row inference, so the shape is
    // asserted here — the columns are literals a few lines up.
    return ((data || []) as unknown as ProductRow[])
      .map((row) => {
        const product = catalogProductFromRow(row);
        return product ? { ...product, description: row.description?.trim() || product.description } : null;
      })
      .filter((product): product is StorefrontProduct => Boolean(product));
  } catch {
    return [];
  }
});

const uuidAtEnd = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type CoPurchaseRow = { product_id: string | null };

/**
 * Products real customers bought in the same paid orders as this one, ranked by
 * how often they co-occurred.
 *
 * The ranking is `get_frequently_bought_together`'s, not this module's. Doing
 * it here meant three service-role round trips on every product page view —
 * pulling up to 500 order ids, then their orders, then up to 2000 line items —
 * to recompute in JavaScript what one indexed `group by` already answers. Worse,
 * it needed the service key, so a deployment without one silently lost the strip
 * even though the function is granted to `anon` and a shopper can call it
 * themselves.
 *
 * An empty list is the honest answer when nothing co-occurs: the page omits the
 * strip rather than inventing recommendations.
 */
export const loadFrequentlyBoughtTogether = cache(async (productId: string): Promise<StorefrontProduct[]> => {
  try {
    const supabase = await createServerSupabaseClient();
    const ranked = await supabase.rpc("get_frequently_bought_together", {
      p_product_id: productId,
      p_limit: 4,
    });
    if (ranked.error || !ranked.data?.length) return [];
    // The RPC returns them best-first; that order is the recommendation.
    const rankedIds = ((ranked.data || []) as CoPurchaseRow[])
      .map((row) => (row.product_id ? String(row.product_id) : ""))
      .filter(Boolean);
    if (!rankedIds.length) return [];

    const productsResult = await supabase
      .from("products")
      .select(productColumns)
      .in("id", rankedIds)
      .eq("is_active", true);
    if (productsResult.error || !productsResult.data?.length) return [];

    const byId = new Map(
      ((productsResult.data || []) as unknown as ProductRow[])
        .map((row) => catalogProductFromRow(row))
        .filter((product): product is StorefrontProduct => Boolean(product))
        .map((product) => [product.id, product]),
    );
    return rankedIds
      .map((id) => byId.get(id))
      .filter((product): product is StorefrontProduct => Boolean(product));
  } catch {
    return [];
  }
});

function fallbackForSlug(slug: string): StorefrontProduct {
  const readable = slug.replace(new RegExp(`-${uuidAtEnd.source}$`, "i"), "");
  const productId = slug.match(uuidAtEnd)?.[0];
  return findProduct(slug) || {
    ...fallbackProducts[0],
    id: productId || fallbackProducts[0].id,
    slug,
    name:
      readable
        .split("-")
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ") || fallbackProducts[0].name,
  };
}

export const loadStorefrontProduct = cache(async (slug: string) => {
  const fallback = fallbackForSlug(slug);
  const productId = slug.match(uuidAtEnd)?.[0];
  if (!productId) return { product: fallback, reviews: [] as PublicProductReview[], found: false };

  try {
    const supabase = await createServerSupabaseClient();
    const productQuery = (columns: string) =>
      supabase.from("products").select(columns).eq("id", productId).eq("is_active", true).maybeSingle();
    const mediaQuery = (columns: string) =>
      supabase
        .from("product_media")
        .select(columns)
        .eq("product_id", productId)
        .eq("is_active", true)
        .order("sort_order");

    const [declaredProduct, variantResult, taggedMedia, reviewResult] = await Promise.all([
      productQuery(`${productColumns},options`),
      supabase
        .from("product_variants")
        .select("id,title,option_values,price,compare_at_price,is_default")
        .eq("product_id", productId)
        .eq("is_active", true),
      mediaQuery(`${mediaColumns},variant_id`),
      supabase
        .from("product_reviews")
        .select("id,rating,title,body,published_at,is_verified_purchase")
        .eq("product_id", productId)
        .eq("status", "approved")
        .order("published_at", { ascending: false })
        .limit(12),
    ]);

    // `options` and `product_media.variant_id` arrive with the variable-products
    // migration. Until it is applied PostgREST fails those selects outright, so
    // each one drops back to the columns that have always existed.
    const productResult = declaredProduct.error ? await productQuery(productColumns) : declaredProduct;
    const mediaResult = taggedMedia.error ? await mediaQuery(mediaColumns) : taggedMedia;

    if (productResult.error || !productResult.data) {
      return { product: fallback, reviews: [] as PublicProductReview[], found: false };
    }

    const row = productResult.data as unknown as ProductRow;
    const variants = variantResult.error ? [] : ((variantResult.data || []) as VariantRow[]);
    const defaultVariant = variants.find((variant) => variant.is_default) || variants[0];
    const mediaRows = mediaResult.error ? [] : ((mediaResult.data || []) as unknown as MediaRow[]);
    const media = [
      ...(row.image_url
        ? [{ type: "image" as const, url: row.image_url, alt: row.name || "Baebe Boo product" }]
        : []),
      ...mediaRows.map((item) => ({
        type: item.media_type,
        url: item.url,
        alt: item.alt_text || row.name || "Baebe Boo product",
        ...(item.variant_id ? { variantId: String(item.variant_id) } : {}),
      })),
    ].filter((item, index, all) => all.findIndex((candidate) => candidate.url === item.url) === index);
    const category = row.category || fallback.category;
    const age = row.age_range || fallback.age;
    const productName = row.name || fallback.name;
    // Declared options win; without the column they are derived from the rows,
    // which is what keeps every pre-migration product rendering its pickers.
    const { options, variants: derivedVariants } = deriveVariantOptions(variants, productName, row.options);
    const isDefaultById = new Map(variants.map((variant) => [variant.id, variant.is_default === true]));
    const imageByVariantId = new Map(
      media
        .filter((item) => item.type === "image" && item.variantId)
        .map((item) => [item.variantId as string, item.url]),
    );
    const mappedVariants: StorefrontVariant[] = derivedVariants.map((variant) => ({
      id: variant.id,
      title: variant.title,
      optionValues: variant.optionValues,
      price: variant.price,
      isDefault: isDefaultById.get(variant.id) === true,
      ...(imageByVariantId.has(variant.id) ? { imageUrl: imageByVariantId.get(variant.id) } : {}),
    }));
    const range = priceRange(mappedVariants);
    const openingPrice = Number(defaultVariant?.price ?? row.price) || fallback.price;
    const product: StorefrontProduct = {
      ...fallback,
      id: row.id,
      slug,
      name: productName,
      category,
      categorySlug: slugify(category),
      age,
      ageSlug: slugify(age.replace("+", "plus")),
      gender: row.gender || fallback.gender,
      price: openingPrice,
      priceFrom: range.from > 0 ? range.from : openingPrice,
      priceTo: range.to > 0 ? range.to : openingPrice,
      compareAtPrice: defaultVariant?.compare_at_price
        ? Number(defaultVariant.compare_at_price)
        : undefined,
      imageUrl: media.find((item) => item.type === "image")?.url || "",
      badge: undefined,
      description: row.description?.trim() || "Verified product details are available from our team.",
      options,
      variants: mappedVariants,
      media,
      specifications: [
        { label: "Category", value: category },
        { label: "Age", value: age },
        { label: "For", value: row.gender || fallback.gender },
      ],
    };

    const reviews = reviewResult.error
      ? []
      : (reviewResult.data || []).map((review) => ({
          id: String(review.id),
          rating: Number(review.rating),
          title: review.title ? String(review.title) : null,
          body: review.body ? String(review.body) : null,
          publishedAt: review.published_at ? String(review.published_at) : null,
          verified: review.is_verified_purchase === true,
        }));

    return { product, reviews, found: true };
  } catch {
    return { product: fallback, reviews: [] as PublicProductReview[], found: false };
  }
});
