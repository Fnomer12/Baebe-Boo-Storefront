"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowDownUp, Search, SlidersHorizontal, Store } from "lucide-react";
import { supabase } from "@/lib/supabase";
import ProductCard from "./ProductCard";
import { PageIntro, StorefrontPage } from "./StorefrontChrome";
import { ageRanges, categories, demoCatalogEnabled, fallbackProducts, fallbackShops, slugify, type StorefrontProduct, type StorefrontShop } from "./catalog-data";
import { addProductToCart } from "@/lib/storefront-state";

type AvailabilityRow = { shop_id: string; is_available: boolean | null; stock_quantity: number | string | null };
type ProductRow = { id: string; name: string | null; category: string | null; age_range: string | null; gender: string | null; price: number | string | null; image_url: string | null; product_shop_availability: AvailabilityRow[] | null };
type ShopRow = { id: string; name: string | null; location: string | null };
type CatalogProduct = StorefrontProduct & { stockByShop: Record<string, number> };

function mapProduct(row: ProductRow, index: number): CatalogProduct {
  const base = fallbackProducts[index % fallbackProducts.length];
  const availability = row.product_shop_availability ?? [];
  return {
    ...base,
    id: row.id,
    slug: `${slugify(row.name || base.name)}-${row.id}`,
    name: row.name || base.name,
    category: row.category || base.category,
    categorySlug: slugify(row.category || base.category),
    age: row.age_range || base.age,
    ageSlug: slugify((row.age_range || base.age).replace("+", "plus")),
    gender: row.gender || base.gender,
    price: Number(row.price) || base.price,
    imageUrl: row.image_url || "",
    stockByShop: Object.fromEntries(availability.filter((item) => item.is_available).map((item) => [item.shop_id, Number(item.stock_quantity) || 0])),
  };
}

export default function StoreCatalog({ initialQuery, initialSort }: { initialQuery: string; initialSort: string }) {
  const [products, setProducts] = useState<CatalogProduct[]>(demoCatalogEnabled ? fallbackProducts.map((product) => ({ ...product, stockByShop: {} })) : []);
  const [shops, setShops] = useState<StorefrontShop[]>(demoCatalogEnabled ? fallbackShops : []);
  const [query, setQuery] = useState(initialQuery);
  const [category, setCategory] = useState("all");
  const [age, setAge] = useState("all");
  const [sort, setSort] = useState(initialSort);
  const [shopId, setShopId] = useState("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    async function load() {
      const [productResult, shopResult] = await Promise.all([
        supabase.from("products").select("id,name,category,age_range,gender,price,image_url,product_shop_availability(shop_id,is_available,stock_quantity)").eq("is_active", true).order("created_at", { ascending: false }),
        supabase.from("shops").select("id,name,location").eq("is_active", true).order("created_at", { ascending: true }),
      ]);
      if (!active) return;
      if (!productResult.error && productResult.data?.length) setProducts((productResult.data as ProductRow[]).map(mapProduct));
      if (!shopResult.error && shopResult.data?.length) setShops((shopResult.data as ShopRow[]).map((shop) => ({ id: shop.id, name: shop.name || "Baebe Boo", location: shop.location || "Ghana", hours: "Confirm hours with the store", phone: "" })));
      setLoading(false);
    }
    void load();
    return () => { active = false; };
  }, []);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const matches = products.filter((product) => (!normalized || `${product.name} ${product.category} ${product.age}`.toLowerCase().includes(normalized)) && (category === "all" || product.categorySlug === category) && (age === "all" || product.ageSlug === age));
    return [...matches].sort((left, right) => sort === "price-low" ? left.price - right.price : sort === "price-high" ? right.price - left.price : left.name.localeCompare(right.name));
  }, [age, category, products, query, sort]);

  function addToCart(product: CatalogProduct) {
    const shop = shops.find((item) => item.id === shopId);
    const stock = shop ? product.stockByShop[shop.id] : undefined;
    if (shop && Object.keys(product.stockByShop).length && Number(stock) < 1) {
      window.dispatchEvent(new CustomEvent("baebe_cart_message", { detail: `${product.name} is not currently available at ${shop.location}.` }));
      setMessage(`${product.name} is not currently available at ${shop.location}.`);
      return;
    }
    addProductToCart(product, { shop, stockAvailable: stock });
    setMessage(shop ? `${product.name} added for ${shop.name}.` : `${product.name} added. We’ll allocate a fulfilment location at checkout.`);
  }

  return (
    <StorefrontPage>
      <div className="storefront-shell pb-20 pt-28 sm:pt-32">
        <PageIntro eyebrow="The Baebe Boo shop" title="Good things for growing little people." description="Browse our national collection, then choose a convenient store when you are ready to confirm availability and add to your bag." />
        <div className="storefront-catalog-toolbar">
          <label className="storefront-search"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search clothing, toys, feeding…" aria-label="Search the catalog" /></label>
          <label><SlidersHorizontal size={17} /><span className="sr-only">Category</span><select value={category} onChange={(event) => setCategory(event.target.value)}><option value="all">All categories</option>{categories.map((item) => <option key={item.slug} value={item.slug}>{item.name}</option>)}</select></label>
          <label><span className="sr-only">Age</span><select value={age} onChange={(event) => setAge(event.target.value)}><option value="all">All ages</option>{ageRanges.map((item) => <option key={item.slug} value={item.slug}>{item.detail}</option>)}</select></label>
          <label><ArrowDownUp size={17} /><span className="sr-only">Sort</span><select value={sort} onChange={(event) => setSort(event.target.value)}><option value="featured">Featured</option><option value="price-low">Price: low to high</option><option value="price-high">Price: high to low</option></select></label>
        </div>
        <div className="storefront-shop-selector"><Store size={19} /><div><strong>{shopId ? "Shopping from a preferred branch" : "Shopping nationwide"}</strong><small>A branch is optional; fulfilment can be allocated later</small></div><select id="shop-selector" value={shopId} onChange={(event) => setShopId(event.target.value)}><option value="">Nationwide allocation</option>{shops.map((shop) => <option key={shop.id} value={shop.id}>{shop.name} — {shop.location}</option>)}</select></div>
        <p aria-live="polite" className="mb-4 min-h-5 text-sm font-medium text-[#396347]">{message}</p>
        <div className="mb-6 flex items-center justify-between"><p className="text-sm text-black/55">{loading ? "Updating the collection…" : `${filtered.length} carefully chosen items`}</p>{(query || category !== "all" || age !== "all") && <button type="button" className="text-sm font-semibold underline underline-offset-4" onClick={() => { setQuery(""); setCategory("all"); setAge("all"); }}>Clear filters</button>}</div>
        {filtered.length ? <div className="storefront-product-grid">{filtered.map((product) => <div key={product.id}><ProductCard product={product} /><button type="button" onClick={() => addToCart(product)} className="mt-2 w-full rounded-full border border-black/10 bg-white py-3 text-sm font-semibold transition hover:bg-black hover:text-white">Add to bag</button></div>)}</div> : <div className="storefront-empty"><Search size={30} /><h2>Nothing matched just yet</h2><p>Try a broader search or clear a filter to see more little finds.</p></div>}
      </div>
    </StorefrontPage>
  );
}
