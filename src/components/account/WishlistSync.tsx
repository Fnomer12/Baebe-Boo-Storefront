"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { storefrontKeys } from "@/lib/storefront-state";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default function WishlistSync() {
  const router = useRouter();
  useEffect(() => {
    let ids: unknown = [];
    try { ids = JSON.parse(localStorage.getItem(storefrontKeys.wishlist) || "[]"); } catch { ids = []; }
    const productIds = Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string" && uuid.test(id)) : [];
    if (!productIds.length) return;
    void Promise.all(productIds.map((productId) => fetch("/api/account/wishlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId, active: true }),
    }))).then(() => router.refresh());
  }, [router]);
  return null;
}
