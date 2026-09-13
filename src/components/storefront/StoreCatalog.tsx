"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowDownUp, Search, SlidersHorizontal, Store } from "lucide-react";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { deriveVariantOptions } from "@/domain/catalog/variant-options";
import ProductCard from "./ProductCard";
import StoreFilters, { emptyStoreFilters, type PriceBucket, type StoreFilterValues } from "./StoreFilters";
import { PageIntro, StorefrontPage } from "./StorefrontChrome";
import { ageRanges, catalogProductFromRow, categories, demoCatalogEnabled, fallbackProducts, fallbackShops, type PublicCatalogRow, type StorefrontProduct, type StorefrontShop } from "./catalog-data";
import { addProductToCart } from "@/lib/storefront-state";

type AvailabilityRow = { shop_id: string; is_available: boolean | null; stock_quantity: number | string | null };
type VariantRow = { id: string; title: string | null; option_values: unknown; price: number | string | null; compare_at_price: number | string | null; is_active: boolean | null };
type ProductRow = Omit<PublicCatalogRow, "product_variants"> & { product_shop_availability: AvailabilityRow[] | null; product_variants: VariantRow[] | null };
type ShopRow = { id: string; name: string | null; location: string | null };
type CatalogProduct = StorefrontProduct & { stockByShop: Record<string, number> };

function mapProduct(row: ProductRow): CatalogProduct | null {
  const product = catalogProductFromRow({ ...row, product_variants: row.product_variants ?? [] });
  if (!product) return null;
  const availability = row.product_shop_availability ?? [];
  const variantRows = (row.product_variants ?? []).filter((variant) => variant.is_active !== false);
  const { options } = deriveVariantOptions(
    variantRows.map((variant) => ({
      id: String(variant.id),
      title: String(variant.title ?? ""),
      option_values: variant.option_values,
      price: variant.price ?? 0,
    })),
    product.name,
  );
  return {
    ...product,
    // Variant-derived options win; without variants the product keeps whatever
    // options it already declared (the demo catalog does).
    options: options.length ? options : product.options,
    stockByShop: Object.fromEntries(availability.filter((item) => item.is_available).map((item) => [item.shop_id, Number(item.stock_quantity) || 0])),
  };
}

/** "Boy", "Boys" and "boys" all filter the same way. */
function normalizeGender(value: string) {
  return value.trim().toLowerCase().replace(/s$/, "");
}

function priceBucketMatches(bucket: PriceBucket, price: number) {
  switch (bucket) {
    case "under-100": return price < 100;
    case "100-250": return price >= 100 && price <= 250;
    case "250-500": return price > 250 && price <= 500;
    case "over-500": return price > 500;
    default: return true;
  }
}

/** Values of a product's named options ("Colour"/"Color", "Size"), any casing. */
function optionValues(product: StorefrontProduct, names: string[]) {
  return product.options
    .filter((option) => names.includes(option.name.trim().toLowerCase()))
    .flatMap((option) => option.values);
}

function productSizes(product: StorefrontProduct) {
  return optionValues(product, ["size"]);
}

function productColors(product: StorefrontProduct) {
  return optionValues(product, ["colour", "color"]);
}

export default function StoreCatalog({ initialQuery, initialSort }: { initialQuery: string; initialSort: string }) {
  const [products, setProducts] = useState<CatalogProduct[]>(demoCatalogEnabled ? fallbackProducts.map((product) => ({ ...product, stockByShop: {} })) : []);
  const [shops, setShops] = useState<StorefrontShop[]>(demoCatalogEnabled ? fallbackShops : []);
  const [query, setQuery] = useState(initialQuery);
  const [category, setCategory] = useState("all");
  const [age, setAge] = useState("all");
  const [sort, setSort] = useState(initialSort);
  const [shopId, setShopId] = useState("");
  const [filters, setFilters] = useState<StoreFilterValues>(emptyStoreFilters);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!isSupabaseConfigured) {
      return;
    }
    let active = true;
    async function load() {
      const [productResult, shopResult] = await Promise.all([
        supabase.from("products").select(// `product_variants` is embedded so the listing can price a variable
        // product honestly (see `catalogProductFromRow`) and derive per-product
        // colour/size filter values. `cost_price` and `barcode` stay excluded:
        // they are outside the anon grant and would fail the whole query for a
        // signed-out shopper.
        "id,name,category,age_range,gender,price,image_url,product_shop_availability(shop_id,is_available,stock_quantity),product_variants(id,title,option_values,price,compare_at_price,is_active)").eq("is_active", true).order("created_at", { ascending: false }),
        supabase.from("shops").select("id,name,location").eq("is_active", true).order("created_at", { ascending: true }),
      ]);
      if (!active) return;
      if (!productResult.error && productResult.data?.length) setProducts((productResult.data as unknown as ProductRow[]).map(mapProduct).filter((product): product is CatalogProduct => Boolean(product)));
      if (!shopResult.error && shopResult.data?.length) setShops((shopResult.data as ShopRow[]).map((shop) => ({ id: shop.id, name: shop.name || "Baebe Boo", location: shop.location || "Ghana", hours: "Confirm hours with the store", phone: "" })));
      setLoading(false);
    }
    void load();
    return () => { active = false; };
  }, []);

  // Keep the URL in sync with the live search/sort (debounced, no history spam).
  useEffect(() => {
    const handle = setTimeout(() => {
      const params = new URLSearchParams();
      const q = query.trim();
      if (q) params.set("q", q);
      if (sort && sort !== "featured") params.set("sort", sort);
      const qs = params.toString();
      window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
    }, 300);
    return () => clearTimeout(handle);
  }, [query, sort]);

  const availableSizes = useMemo(
    () => [...new Set(products.flatMap(productSizes))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
    [products],
  );
  const availableColors = useMemo(
    () => [...new Set(products.flatMap(productColors))].sort((a, b) => a.localeCompare(b)),
    [products],
  );

  const activeFilterCount =
    (filters.gender !== "all" ? 1 : 0) +
    (filters.priceBucket !== "all" ? 1 : 0) +
    filters.sizes.length +
    filters.colors.length;

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const matches = products.filter((product) => {
      if (normalized && !`${product.name} ${product.category} ${product.age}`.toLowerCase().includes(normalized)) return false;
      if (category !== "all" && product.categorySlug !== category) return false;
      if (age !== "all" && product.ageSlug !== age) return false;
      // AND across filter groups, OR within a group.
      if (filters.gender !== "all" && normalizeGender(product.gender) !== normalizeGender(filters.gender)) return false;
      if (!priceBucketMatches(filters.priceBucket, product.price)) return false;
      if (filters.sizes.length && !productSizes(product).some((size) => filters.sizes.includes(size))) return false;
      if (filters.colors.length && !productColors(product).some((color) => filters.colors.includes(color))) return false;
      return true;
    });
    return [...matches].sort((left, right) => sort === "price-low" ? left.price - right.price : sort === "price-high" ? right.price - left.price : left.name.localeCompare(right.name));
  }, [age, category, filters, products, query, sort]);

  function clearAllFilters() {
    setQuery("");
    setCategory("all");
    setAge("all");
    setFilters(emptyStoreFilters);
  }

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
    <StorefrontPage showReadinessBanner>
      <div className="storefront-shell pb-20 pt-28 sm:pt-32">
        <PageIntro eyebrow="The Baebe Boo shop" title="Good things for growing little people." description="Browse our national collection, then choose a convenient store when you are ready to confirm availability and add to your bag." />
        <div className="storefront-catalog-toolbar">
          <label className="storefront-search"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search clothing, toys, feeding…" aria-label="Search the catalog" /></label>
          <label><SlidersHorizontal size={17} /><span className="sr-only">Category</span><select value={category} onChange={(event) => setCategory(event.target.value)}><option value="all">All categories</option>{categories.map((item) => <option key={item.slug} value={item.slug}>{item.name}</option>)}</select></label>
          <label><span className="sr-only">Age</span><select value={age} onChange={(event) => setAge(event.target.value)}><option value="all">All ages</option>{ageRanges.map((item) => <option key={item.slug} value={item.slug}>{item.detail}</option>)}</select></label>
          <label><ArrowDownUp size={17} /><span className="sr-only">Sort</span><select value={sort} onChange={(event) => setSort(event.target.value)}><option value="featured">Featured</option><option value="price-low">Price: low to high</option><option value="price-high">Price: high to low</option></select></label>
          <button type="button" onClick={() => setFiltersOpen(true)} aria-expanded={filtersOpen} aria-controls="store-filters">
            <SlidersHorizontal size={17} />
            Filters
            {activeFilterCount > 0 && <span className="ml-auto grid h-5 min-w-5 place-items-center rounded-full bg-black px-1 text-[10px] font-bold text-white">{activeFilterCount}</span>}
          </button>
        </div>
        <div className="storefront-shop-selector"><Store size={19} /><div><strong>{shopId ? "Shopping from a preferred branch" : "Shopping nationwide"}</strong><small>A branch is optional; fulfilment can be allocated later</small></div><select id="shop-selector" value={shopId} onChange={(event) => setShopId(event.target.value)}><option value="">Nationwide allocation</option>{shops.map((shop) => <option key={shop.id} value={shop.id}>{shop.name} — {shop.location}</option>)}</select></div>
        <p aria-live="polite" className="mb-4 min-h-5 text-sm font-medium text-[#396347]">{message}</p>
        <div className="mb-6 flex items-center justify-between"><p className="text-sm text-black/55">{loading ? "Updating the collection…" : `${filtered.length} carefully chosen items`}</p>{(query || category !== "all" || age !== "all" || activeFilterCount > 0) && <button type="button" className="text-sm font-semibold underline underline-offset-4" onClick={clearAllFilters}>Clear filters</button>}</div>
        {filtered.length ? <div className="storefront-product-grid">{filtered.map((product) => <div key={product.id}><ProductCard product={product} /><button type="button" onClick={() => addToCart(product)} className="mt-2 w-full rounded-full border border-black/10 bg-white py-3 text-sm font-semibold transition hover:bg-black hover:text-white">Add to bag</button></div>)}</div> : <div className="storefront-empty"><Search size={30} /><h2>Nothing matched just yet</h2><p>Try a broader search or clear a filter to see more little finds.</p></div>}
      </div>
      <StoreFilters
        open={filtersOpen}
        values={filters}
        availableSizes={availableSizes}
        availableColors={availableColors}
        onChange={setFilters}
        onClose={() => setFiltersOpen(false)}
      />
    </StorefrontPage>
  );
}
