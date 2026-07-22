"use client";

import { useEffect } from "react";
import { storefrontKeys } from "@/lib/storefront-state";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default function WishlistSync() {
  useEffect(() => {
    let ids: unknown = [];
    try { ids = JSON.parse(localStorage.getItem(storefrontKeys.wishlist) || "[]"); } catch { ids = []; }
    const productIds = Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string" && uuid.test(id)) : [];
    void fetch("/api/account/wishlist")
      .then(async (response) => response.ok ? response.json() as Promise<{ productIds?: unknown }> : { productIds: [] })
      .then(async (result) => {
        const serverIds = Array.isArray(result.productIds)
          ? result.productIds.filter((id): id is string => typeof id === "string" && uuid.test(id))
          : [];
        const union = [...new Set([...serverIds, ...productIds])];
        localStorage.setItem(storefrontKeys.wishlist, JSON.stringify(union));
        window.dispatchEvent(new Event("baebe_wishlist_hydrated"));
        const missingOnServer = productIds.filter((id) => !serverIds.includes(id));
        await Promise.all(missingOnServer.map((productId) => fetch("/api/account/wishlist", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ productId, active: true }),
        })));
      })
      .catch(() => undefined);
  }, []);
  return null;
}
