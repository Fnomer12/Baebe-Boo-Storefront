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
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-[5.25rem] z-40 px-3 sm:top-[5.75rem] sm:px-4 md:top-[6.5rem] md:px-6"
    >
      <div className="pointer-events-auto mx-auto flex max-w-3xl items-start gap-3 rounded-2xl border border-amber-200/90 bg-amber-50/95 px-4 py-3 text-left text-sm text-amber-950 shadow-lg shadow-amber-950/10 backdrop-blur-md sm:items-center sm:rounded-full sm:px-5 sm:py-3">
        <span
          aria-hidden="true"
          className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-200 text-xs font-bold sm:mt-0"
        >
          !
        </span>
        <p className="min-w-0 flex-1 leading-5">
          Our online store is still getting ready — browsing is open, but products are
          not available for purchase just yet. Check back soon.
        </p>
      </div>
    </div>
  );
}
