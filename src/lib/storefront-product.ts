import "server-only";

import { cache } from "react";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  catalogProductFromRow,
  fallbackProducts,
  findProduct,
  slugify,
  type StorefrontProduct,
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
};

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
    const { data, error } = await supabase
      .from("products")
      .select("id,name,category,age_range,gender,price,image_url,description")
      .eq("is_active", true)
      .order("created_at", { ascending: false });
    if (error) return [];
    return ((data || []) as ProductRow[])
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

function optionStrings(rows: VariantRow[], ...keys: string[]): string[] {
  const values = rows.flatMap((row) => {
    if (!row.option_values || typeof row.option_values !== "object" || Array.isArray(row.option_values)) {
      return [];
    }
    const match = Object.entries(row.option_values).find(
      ([name]) => keys.includes(name.toLowerCase()),
    )?.[1];
    return typeof match === "string" && match.trim() ? [match.trim()] : [];
  });
  return [...new Set(values)];
}

export const loadStorefrontProduct = cache(async (slug: string) => {
  const fallback = fallbackForSlug(slug);
  const productId = slug.match(uuidAtEnd)?.[0];
  if (!productId) return { product: fallback, reviews: [] as PublicProductReview[], found: false };

  try {
    const supabase = await createServerSupabaseClient();
    const [productResult, variantResult, mediaResult, reviewResult] = await Promise.all([
      supabase
        .from("products")
        .select("id,name,category,age_range,gender,price,image_url,description")
        .eq("id", productId)
        .eq("is_active", true)
        .maybeSingle(),
      supabase
        .from("product_variants")
        .select("id,title,option_values,price,compare_at_price,is_default")
        .eq("product_id", productId)
        .eq("is_active", true),
      supabase
        .from("product_media")
        .select("media_type,url,alt_text")
        .eq("product_id", productId)
        .eq("is_active", true)
        .order("sort_order"),
      supabase
        .from("product_reviews")
        .select("id,rating,title,body,published_at,is_verified_purchase")
        .eq("product_id", productId)
        .eq("status", "approved")
        .order("published_at", { ascending: false })
        .limit(12),
    ]);

    if (productResult.error || !productResult.data) {
      return { product: fallback, reviews: [] as PublicProductReview[], found: false };
    }

    const row = productResult.data as ProductRow;
    const variants = variantResult.error ? [] : ((variantResult.data || []) as VariantRow[]);
    const defaultVariant = variants.find((variant) => variant.is_default) || variants[0];
    const mediaRows = mediaResult.error ? [] : ((mediaResult.data || []) as MediaRow[]);
    const media = [
      ...(row.image_url
        ? [{ type: "image" as const, url: row.image_url, alt: row.name || "Baebe Boo product" }]
        : []),
      ...mediaRows.map((item) => ({
        type: item.media_type,
        url: item.url,
        alt: item.alt_text || row.name || "Baebe Boo product",
      })),
    ].filter((item, index, all) => all.findIndex((candidate) => candidate.url === item.url) === index);
    const category = row.category || fallback.category;
    const age = row.age_range || fallback.age;
    const colors = optionStrings(variants, "color", "colour");
    const sizes = optionStrings(variants, "size");
    const mappedVariants = variants.map((variant) => {
      const options = variant.option_values && typeof variant.option_values === "object" && !Array.isArray(variant.option_values)
        ? Object.fromEntries(Object.entries(variant.option_values).map(([key, value]) => [key.toLowerCase(), value]))
        : {};
      return {
        id: variant.id,
        title: variant.title,
        color: typeof (options.color ?? options.colour) === "string" ? String(options.color ?? options.colour) : undefined,
        size: typeof options.size === "string"
          ? options.size
          : options.color || options.colour
            ? undefined
            : variant.title === "Default Title" ? undefined : variant.title,
        price: Number(variant.price),
      };
    });
    const product: StorefrontProduct = {
      ...fallback,
      id: row.id,
      slug,
      name: row.name || fallback.name,
      category,
      categorySlug: slugify(category),
      age,
      ageSlug: slugify(age.replace("+", "plus")),
      gender: row.gender || fallback.gender,
      price: Number(defaultVariant?.price ?? row.price) || fallback.price,
      compareAtPrice: defaultVariant?.compare_at_price
        ? Number(defaultVariant.compare_at_price)
        : undefined,
      imageUrl: media.find((item) => item.type === "image")?.url || "",
      badge: undefined,
      description: row.description?.trim() || "Verified product details are available from our team.",
      colors,
      sizes: sizes.length
        ? sizes
        : colors.length
          ? []
          : variants.map((variant) => variant.title).filter((title) => title && title !== "Default Title"),
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
