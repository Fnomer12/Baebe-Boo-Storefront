"use client";

import { useEffect, useState } from "react";
import { Heart } from "lucide-react";
import type { StorefrontProduct } from "./catalog-data";
import { productListContains, storefrontKeys, toggleProductList } from "@/lib/storefront-state";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Compact wishlist toggle used on catalog cards. It shares the same
// `baebe_wishlist` store and `/api/account/wishlist` sync as the product page,
// so a heart saved here shows as saved everywhere else too.
export default function SaveButton({ product }: { product: StorefrontProduct }) {
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const refresh = () => setSaved(productListContains(storefrontKeys.wishlist, product.id));
    const frame = window.requestAnimationFrame(refresh);
    window.addEventListener("baebe_wishlist_hydrated", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("baebe_wishlist_hydrated", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [product.id]);

  function toggle() {
    const result = toggleProductList(storefrontKeys.wishlist, product.id);
    setSaved(result.active);
    window.dispatchEvent(
      new CustomEvent("baebe_cart_message", {
        detail: result.active ? `Saved ${product.name} to your wishlist.` : "Removed from your wishlist.",
      }),
    );
    if (uuidPattern.test(product.id)) {
      void fetch("/api/account/wishlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: product.id, active: result.active }),
      });
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={saved}
      aria-label={saved ? `Remove ${product.name} from wishlist` : `Save ${product.name} to wishlist`}
      className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full bg-white/90 shadow-sm backdrop-blur transition hover:scale-105"
    >
      <Heart size={18} className={saved ? "fill-[#e0577f] text-[#e0577f]" : ""} />
    </button>
  );
}
