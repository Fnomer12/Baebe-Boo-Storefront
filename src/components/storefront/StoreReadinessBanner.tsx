"use client";

import { useEffect, useState } from "react";

/**
 * "Store not ready" banner, shown on every storefront page while the
 * `store_ready` flag is off (BaebeAdmin → Products → "Store live").
 *
 * Client-fetched on mount so statically prerendered pages still reflect the
 * live flag. Fails open: if the status cannot be read, no banner is shown
 * rather than alarming customers over a broken endpoint.
 */
export default function StoreReadinessBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/storefront/status", { cache: "no-store" });
        const payload = (await response.json().catch(() => null)) as { ready?: unknown } | null;
        if (!cancelled && response.ok && payload && payload.ready === false) {
          setVisible(true);
        }
      } catch {
        // Fail open — no banner.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!visible) return null;

  return (
    <div
      role="status"
      className="bg-amber-400 px-4 py-3 text-center text-sm font-semibold text-amber-950"
    >
      Our online store is still getting ready — browsing is open, but products are
      not available for purchase just yet. Check back soon.
    </div>
  );
}
