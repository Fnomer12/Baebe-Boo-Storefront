"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, GitCompareArrows, Heart, MessageCircle, ShoppingBag, Zap } from "lucide-react";
import type { StorefrontProduct } from "./catalog-data";
import { whatsappUrl } from "./StorefrontChrome";
import { addProductToCart, productListContains, recordRecentlyViewed, selectedStore, storefrontKeys, toggleProductList } from "@/lib/storefront-state";
import { supabase } from "@/lib/supabase";

type Availability = "loading" | "in_stock" | "low_stock" | "out_of_stock" | "unknown";

export default function ProductActions({ product }: { product: StorefrontProduct }) {
  const hasLiveProductId = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(product.id);
  const [color, setColor] = useState(product.colors[0] || "");
  const [size, setSize] = useState(product.sizes[0] || "");
  const [message, setMessage] = useState("");
  const [wished, setWished] = useState(false);
  const [comparing, setComparing] = useState(false);
  const [availability, setAvailability] = useState<Availability>(hasLiveProductId ? "loading" : "unknown");

  useEffect(() => {
    recordRecentlyViewed(product.id);
    const frame = window.requestAnimationFrame(() => {
      setWished(productListContains(storefrontKeys.wishlist, product.id));
      setComparing(productListContains(storefrontKeys.compare, product.id));
    });
    return () => window.cancelAnimationFrame(frame);
  }, [product.id]);

  useEffect(() => {
    if (!hasLiveProductId) return;
    let active = true;
    void supabase.rpc("get_product_availability", { p_product_ids: [product.id] }).then(({ data, error }) => {
      if (!active) return;
      const value = (data as Array<{ availability?: string }> | null)?.[0]?.availability;
      setAvailability(!error && (value === "in_stock" || value === "low_stock" || value === "out_of_stock") ? value : "unknown");
    });
    return () => { active = false; };
  }, [hasLiveProductId, product.id]);

  function addToBag(buyNow = false) {
    if (availability === "out_of_stock") {
      setMessage("This item is currently out of stock.");
      return;
    }
    const shop = selectedStore();
    const matchingVariant = product.variants?.find((variant) =>
      (!variant.color || variant.color === color) && (!variant.size || variant.size === size),
    );
    if (product.variants?.length && !matchingVariant) {
      setMessage("That colour and size combination is not available.");
      return;
    }
    addProductToCart(product, {
      color,
      size,
      variantId: matchingVariant?.id,
      unitPrice: matchingVariant?.price,
      shop,
    });
    setMessage(shop ? `Added to your ${shop.name} bag.` : "Added to your bag. We’ll confirm the best fulfilment location at checkout.");
    if (buyNow) window.location.assign("/cart");
  }

  function toggleWishlist() {
    const result = toggleProductList(storefrontKeys.wishlist, product.id);
    setWished(result.active);
    setMessage(result.active ? "Saved to your wishlist." : "Removed from your wishlist.");
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(product.id)) {
      void fetch("/api/account/wishlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: product.id, active: result.active }),
      });
    }
  }

  function toggleCompare() {
    const result = toggleProductList(storefrontKeys.compare, product.id, 4);
    if (result.full) {
      setMessage("You can compare up to four products. Remove one before adding another.");
      return;
    }
    setComparing(result.active);
    setMessage(result.active ? "Added to compare." : "Removed from compare.");
  }
  return (
    <div className="space-y-6">
      {product.colors.length > 0 && <fieldset><legend className="mb-3 text-xs font-bold uppercase tracking-[0.16em]">Colour: <span className="font-medium text-black/50">{color}</span></legend><div className="flex flex-wrap gap-2">{product.colors.map((item) => <button type="button" key={item} onClick={() => setColor(item)} className={`rounded-full border px-4 py-2.5 text-sm ${color === item ? "border-black bg-black text-white" : "border-black/10 bg-white"}`}>{item}</button>)}</div></fieldset>}
      {product.sizes.length > 0 && <fieldset><legend className="mb-3 text-xs font-bold uppercase tracking-[0.16em]">Size: <span className="font-medium text-black/50">{size}</span></legend><div className="flex flex-wrap gap-2">{product.sizes.map((item) => <button type="button" key={item} onClick={() => setSize(item)} className={`rounded-full border px-4 py-2.5 text-sm ${size === item ? "border-black bg-black text-white" : "border-black/10 bg-white"}`}>{item}</button>)}</div></fieldset>}
      <div className="flex items-center gap-2 rounded-2xl bg-[#f5eee5] px-4 py-3 text-sm text-[#704d38]"><Zap size={17} /><span>{availability === "in_stock" ? <><strong>In stock.</strong> Available across our fulfilment network.</> : availability === "low_stock" ? <><strong>Low stock.</strong> Order soon while it is still available.</> : availability === "out_of_stock" ? <><strong>Out of stock.</strong> Check back soon or ask our team for help.</> : availability === "loading" ? "Checking live availability…" : <><strong>Availability checked at checkout.</strong> We’ll confirm the best fulfilment location.</>}</span></div>
      <div className="grid gap-3 sm:grid-cols-2">
        <button type="button" disabled={availability === "out_of_stock"} onClick={() => addToBag(false)} className="storefront-primary-button disabled:cursor-not-allowed disabled:opacity-45"><ShoppingBag size={18} /> Add to bag</button>
        <button type="button" disabled={availability === "out_of_stock"} onClick={() => addToBag(true)} className="storefront-secondary-button disabled:cursor-not-allowed disabled:opacity-45">Buy now</button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={toggleWishlist} aria-pressed={wished} className="storefront-secondary-button">{wished ? <Check size={18} /> : <Heart size={18} />} {wished ? "Saved" : "Wishlist"}</button>
        <button type="button" onClick={toggleCompare} aria-pressed={comparing} className="storefront-secondary-button">{comparing ? <Check size={18} /> : <GitCompareArrows size={18} />} {comparing ? "Comparing" : "Compare"}</button>
      </div>
      <p role="status" aria-live="polite" className="min-h-5 text-sm font-medium text-[#396347]">{message}</p>
      <Link href={whatsappUrl.startsWith("https://") ? `${whatsappUrl.split("?")[0]}?text=${encodeURIComponent(`Hello Baebe Boo, I have a question about ${product.name}.`)}` : whatsappUrl} target="_blank" className="flex items-center gap-2 text-sm font-semibold underline underline-offset-4"><MessageCircle size={17} /> Ask about this product</Link>
    </div>
  );
}
