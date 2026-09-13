"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { GitCompareArrows, ShoppingBag, X } from "lucide-react";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { buildCompareSpecRows } from "@/lib/compare";
import { addProductToCart, compareProductIds, selectedStore, storefrontKeys, toggleProductList } from "@/lib/storefront-state";
import { PageIntro, StorefrontPage } from "./StorefrontChrome";
import { ProductVisual } from "./ProductCard";
import { catalogProductFromRow, demoCatalogEnabled, fallbackProducts, formatPrice, type PublicCatalogRow, type StorefrontProduct } from "./catalog-data";

type Availability = "in_stock" | "out_of_stock" | "unknown";
type AvailabilityRow = { is_available: boolean | null; stock_quantity: number | string | null };
type ProductRow = PublicCatalogRow & { product_shop_availability: AvailabilityRow[] | null };
type CompareProduct = StorefrontProduct & { availability: Availability };

const availabilityCopy: Record<Availability, string> = {
  in_stock: "In stock",
  out_of_stock: "Out of stock",
  unknown: "Confirmed at checkout",
};

const availabilityTone: Record<Availability, string> = {
  in_stock: "text-[#396347]",
  out_of_stock: "text-[#a3444f]",
  unknown: "text-[var(--color-ink-soft)]",
};

function withUnknownAvailability(product: StorefrontProduct): CompareProduct {
  return { ...product, availability: "unknown" };
}

function mapRow(row: ProductRow): CompareProduct | null {
  const product = catalogProductFromRow(row);
  if (!product) return null;
  const availability = (row.product_shop_availability ?? []).filter((item) => item.is_available);
  const stock = availability.reduce((total, item) => total + (Number(item.stock_quantity) || 0), 0);
  return { ...product, availability: availability.length === 0 ? "unknown" : stock > 0 ? "in_stock" : "out_of_stock" };
}

function joinOrDash(values: string[]): string {
  return values.length ? values.join(", ") : "—";
}

export default function CompareView() {
  const [catalog, setCatalog] = useState<CompareProduct[]>(demoCatalogEnabled ? fallbackProducts.map(withUnknownAvailability) : []);
  const [compareIds, setCompareIds] = useState<string[] | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setCompareIds(compareProductIds()));
    let active = true;
    async function load() {
      if (!isSupabaseConfigured) return;
      const { data, error } = await supabase
        .from("products")
        .select("id,name,category,age_range,gender,price,image_url,product_shop_availability(is_available,stock_quantity)")
        .eq("is_active", true)
        .order("created_at", { ascending: false });
      if (!active) return;
      if (!error && data?.length) setCatalog((data as ProductRow[]).map(mapRow).filter((product): product is CompareProduct => Boolean(product)));
    }
    void load();
    return () => {
      active = false;
      window.cancelAnimationFrame(frame);
    };
  }, []);

  const byId = useMemo(() => new Map(catalog.map((product) => [product.id, product])), [catalog]);
  const products = useMemo(() => (compareIds ?? []).map((id) => byId.get(id)).filter((product): product is CompareProduct => Boolean(product)), [byId, compareIds]);
  const specRows = useMemo(() => buildCompareSpecRows(products), [products]);

  function removeFromCompare(id: string) {
    toggleProductList(storefrontKeys.compare, id);
    setCompareIds((current) => (current ?? []).filter((item) => item !== id));
  }

  function addToBag(product: CompareProduct) {
    addProductToCart(product, { shop: selectedStore() });
    setMessage(`${product.name} added to your bag.`);
  }

  // Distinct option names across the products being compared, in first-seen
  // order so the rows read in the order the seller declared them (colour
  // before size).
  const comparedOptionNames = useMemo(() => {
    const names: string[] = [];
    for (const product of products) {
      for (const option of product.options ?? []) {
        if (!names.some((name) => name.toLowerCase() === option.name.toLowerCase())) {
          names.push(option.name);
        }
      }
    }
    return names;
  }, [products]);

  const attributeRows: Array<{ label: string; value: (product: CompareProduct) => React.ReactNode }> = [
    { label: "Price", value: (product) => <span className="font-semibold">{formatPrice(product.price)}{product.compareAtPrice ? <span className="ml-2 text-xs font-normal text-[var(--color-ink-soft)] line-through">{formatPrice(product.compareAtPrice)}</span> : null}</span> },
    { label: "Category", value: (product) => product.category },
    { label: "Age", value: (product) => product.age },
    { label: "Gender", value: (product) => product.gender },
    // One row per option name across everything being compared, rather than a
    // hardcoded Colours row and a hardcoded Sizes row. A product that comes in
    // materials or pack sizes now compares on those too, and a catalogue with
    // no colours at all stops showing an empty "Colours —" line.
    ...comparedOptionNames.map((name) => ({
      label: name,
      value: (product: CompareProduct) =>
        joinOrDash(
          product.options.find(
            (option) => option.name.toLowerCase() === name.toLowerCase(),
          )?.values ?? [],
        ),
    })),
    { label: "Availability", value: (product) => <span className={`font-semibold ${availabilityTone[product.availability]}`}>{availabilityCopy[product.availability]}</span> },
  ];

  return (
    <StorefrontPage showReadinessBanner>
      <div className="storefront-shell pb-20 pt-28 sm:pt-32">
        <PageIntro eyebrow="Compare products" title="Side by side, made simple." description="Your shortlist, lined up next to each other so you can choose with confidence. You can compare up to four products at a time." />
        <p role="status" aria-live="polite" className="mb-4 min-h-5 text-sm font-medium text-[#396347]">{message}</p>
        {compareIds === null ? (
          <div className="storefront-empty"><GitCompareArrows size={30} /><h2>Gathering your shortlist…</h2></div>
        ) : products.length === 0 ? (
          <div className="storefront-empty">
            <GitCompareArrows size={30} />
            <h2>Nothing to compare yet</h2>
            <p>Tap the compare button on any product to line it up here.</p>
            <Link href="/store" className="storefront-primary-button mt-6">Browse the shop</Link>
          </div>
        ) : (
          <>
            {products.length === 1 && (
              <div className="mb-6 flex flex-wrap items-center gap-3 rounded-2xl bg-[var(--color-brand-tint)] px-4 py-3 text-sm">
                <span>Add at least one more product to compare them side by side.</span>
                <Link href="/store" className="font-semibold text-[var(--color-brand-deep)] underline underline-offset-4">Keep browsing</Link>
              </div>
            )}
            <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-[var(--color-surface)] shadow-[var(--shadow-sm)]">
              <table className="w-full min-w-[40rem] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-[var(--color-line)]">
                    <th scope="col" className="w-36 p-4 text-left align-bottom text-xs font-bold uppercase tracking-[0.16em] text-[var(--color-ink-soft)]">Product</th>
                    {products.map((product) => (
                      <th scope="col" key={product.id} className="min-w-[13rem] p-4 text-left align-bottom font-normal">
                        <div className="relative">
                          <Link href={`/products/${product.slug}`} aria-label={`View ${product.name}`}>
                            <ProductVisual product={product} className="aspect-[4/3]" />
                          </Link>
                          <button type="button" onClick={() => removeFromCompare(product.id)} aria-label={`Remove ${product.name} from compare`} className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full border border-[var(--color-line)] bg-[var(--color-surface)] transition hover:border-[var(--color-ink)] hover:bg-[var(--color-ink)] hover:text-white">
                            <X size={15} />
                          </button>
                        </div>
                        <Link href={`/products/${product.slug}`} className="mt-3 block text-base font-semibold leading-snug">{product.name}</Link>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {attributeRows.map((row) => (
                    <tr key={row.label} className="border-b border-[var(--color-line)] last:border-0">
                      <th scope="row" className="p-4 text-left align-top text-xs font-bold uppercase tracking-[0.16em] text-[var(--color-ink-soft)]">{row.label}</th>
                      {products.map((product) => <td key={product.id} className="p-4 align-top">{row.value(product)}</td>)}
                    </tr>
                  ))}
                  {specRows.map((row) => (
                    <tr key={row.label} className="border-b border-[var(--color-line)] last:border-0">
                      <th scope="row" className="p-4 text-left align-top text-xs font-bold uppercase tracking-[0.16em] text-[var(--color-ink-soft)]">{row.label}</th>
                      {row.values.map((value, index) => <td key={products[index].id} className="p-4 align-top">{value}</td>)}
                    </tr>
                  ))}
                  <tr>
                    <th scope="row" className="p-4" />
                    {products.map((product) => (
                      <td key={product.id} className="p-4 align-top">
                        <div className="grid gap-2">
                          <button type="button" onClick={() => addToBag(product)} className="storefront-primary-button min-h-11 px-4 py-2 text-xs"><ShoppingBag size={15} /> Add to bag</button>
                          <Link href={`/products/${product.slug}`} className="storefront-secondary-button min-h-11 px-4 py-2 text-xs">View product</Link>
                        </div>
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </StorefrontPage>
  );
}
