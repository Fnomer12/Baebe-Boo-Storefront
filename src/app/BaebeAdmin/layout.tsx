import type { ReactNode } from "react";

// Admin pages must not be prerendered or cached by shared/proxy caches. Stale
// admin HTML can reference old hashed `_next/static` chunks after a redeploy,
// which browsers then reject as corrupted or wrong-MIME resources.
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export default function BaebeAdminLayout({ children }: { children: ReactNode }) {
  return children;
}
