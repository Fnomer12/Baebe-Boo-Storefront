import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";

/**
 * Bring `report_daily_profit` up to date after a sale.
 *
 * That view is materialized, so profit, cost of goods, discounts, refunds and
 * "sales by branch" all read from a snapshot rather than from `orders`. Nothing
 * refreshed it, so the admin dashboard showed a GH₵0 profit summary and an
 * empty branch panel while the KPI tiles — which query `orders` directly —
 * reported the day's real takings. Two contradictory revenue figures on one
 * screen, with the wrong one feeding gross margin.
 *
 * The refresh runs `concurrently` (the unique index on `(day, shop_id)` makes
 * that legal), so readers are never blocked by it.
 *
 * A failure here must never surface to the caller: every call site sits after
 * money has already changed hands, and a stale report is a far smaller problem
 * than an order that reports itself as failed once it is paid. The error is
 * returned for logging instead of thrown.
 */
export async function refreshProfitReports(): Promise<{ error: Error | null }> {
  const { error } = await supabaseAdmin.rpc("refresh_daily_profit");
  return { error: error ? new Error(error.message) : null };
}
