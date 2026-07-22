"use client";

import { useEffect, useMemo, useState } from "react";
import { rankRecommendations } from "@/domain/recommendations/rank";
import { recentlyViewedProductIds } from "@/lib/storefront-state";
import { supabase } from "@/lib/supabase";
import ProductCard from "./ProductCard";
import { demoCatalogEnabled, fallbackProducts, slugify, type StorefrontProduct } from "./catalog-data";

type ProductRow = {
  id: string;
  name: string | null;
  category: string | null;
  age_range: string | null;
  gender: string | null;
  price: number | string | null;
  image_url: string | null;
};

type PairingRow = { product_id: string; purchase_count: number | string };

function mapProduct(row: ProductRow, index: number): StorefrontProduct {
  const base = fallbackProducts[index % fallbackProducts.length];
  const name = row.name || base.name;
  const category = row.category || base.category;
  const age = row.age_range || base.age;
  return {
    ...base,
    id: row.id,
    slug: `${slugify(name)}-${row.id}`,
    name,
    category,
    categorySlug: slugify(category),
    age,
    ageSlug: slugify(age.replace("+", "plus")),
    gender: row.gender || base.gender,
    price: Number(row.price) || base.price,
    imageUrl: row.image_url || "",
  };
}

function ProductStrip({ eyebrow, title, products }: { eyebrow: string; title: string; products: StorefrontProduct[] }) {
  if (!products.length) return null;
  return (
    <section className="mt-20">
      <div className="storefront-section-heading"><div><p className="storefront-eyebrow">{eyebrow}</p><h2>{title}</h2></div></div>
      <div className="storefront-product-grid">{products.slice(0, 4).map((product) => <ProductCard key={product.id} product={product} />)}</div>
    </section>
  );
}

export default function ProductRecommendations({ current }: { current: StorefrontProduct }) {
  const [catalog, setCatalog] = useState<StorefrontProduct[]>(demoCatalogEnabled ? fallbackProducts : []);
  const [pairings, setPairings] = useState<PairingRow[]>([]);
  const [recentIds, setRecentIds] = useState<string[]>([]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setRecentIds(recentlyViewedProductIds().filter((id) => id !== current.id)));
    let active = true;
    async function load() {
      const productsRequest = supabase.from("products").select("id,name,category,age_range,gender,price,image_url").eq("is_active", true).limit(48);
      const pairingRequest = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(current.id)
        ? supabase.rpc("get_frequently_bought_together", { p_product_id: current.id, p_limit: 4 })
        : Promise.resolve({ data: [], error: null });
      const [productsResult, pairingResult] = await Promise.all([productsRequest, pairingRequest]);
      if (!active) return;
      if (!productsResult.error && productsResult.data?.length) setCatalog((productsResult.data as ProductRow[]).map(mapProduct));
      if (!pairingResult.error && pairingResult.data) setPairings(pairingResult.data as PairingRow[]);
    }
    void load();
    return () => { active = false; window.cancelAnimationFrame(frame); };
  }, [current.id]);

  const byId = useMemo(() => new Map(catalog.map((product) => [product.id, product])), [catalog]);
  const frequentlyBought = pairings.map((pairing) => byId.get(pairing.product_id)).filter((product): product is StorefrontProduct => Boolean(product));
  const recommendations = rankRecommendations(current, catalog).filter((product) => !frequentlyBought.some((paired) => paired.id === product.id));
  const recentlyViewed = recentIds.map((id) => byId.get(id)).filter((product): product is StorefrontProduct => Boolean(product));

  return (
    <>
      <ProductStrip eyebrow="Chosen together by real customers" title="Frequently bought together" products={frequentlyBought} />
      <ProductStrip eyebrow="Picked for this age and collection" title="You may also love" products={recommendations} />
      <ProductStrip eyebrow="Your recent finds" title="Recently viewed" products={recentlyViewed} />
    </>
  );
}
