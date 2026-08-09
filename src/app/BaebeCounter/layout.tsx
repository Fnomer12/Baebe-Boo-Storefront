import type { ReactNode } from "react";

// Counter pages must not be prerendered or cached by shared/proxy caches.
// Stale counter HTML can reference old hashed `_next/static` chunks after a
// redeploy, which browsers then reject as corrupted or wrong-MIME resources —
// and a till that will not load is a shop that cannot sell.
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export default function BaebeCounterLayout({ children }: { children: ReactNode }) {
  return children;
}
