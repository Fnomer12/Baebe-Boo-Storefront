import { NextResponse } from "next/server";
import { tryCreateServerSupabaseClient } from "@/lib/supabase/server";

type Availability = "in_stock" | "low_stock" | "out_of_stock" | "unknown";

const knownAvailability = ["in_stock", "low_stock", "out_of_stock"] as const;

type AvailabilityRow = { product_id: string | null; availability: string | null };

/**
 * Deliberately uncached: an unknown answer is a degraded one, and caching it for
 * a minute would spread one transient failure across every shopper.
 */
function unknownAvailability() {
  return NextResponse.json({ status: true, availability: "unknown" satisfies Availability });
}

/**
 * What the buy box says about stock.
 *
 * "Out of stock" disables Add to bag and Buy now, so the only safe answer to a
 * question this route cannot settle is `unknown` — the shopper is then told
 * availability is confirmed at checkout, and the product stays buyable.
 *
 * That is why the verdict comes from `get_product_availability`, the database's
 * own variant-aware view of stock, rather than from counting rows in the legacy
 * `product_shop_availability` table. Counting rows read an EMPTY result as sold
 * out, which quietly made every product that was never backfilled into that
 * table impossible to buy. The RPC returns no row for a product it cannot judge
 * — one with no variants, or variants with no `inventory_levels` — and that
 * silence means "we will confirm", never "no".
 *
 * The function is granted to `anon`, so a shopper's own credentials answer this
 * and a deployment without a service key still sells.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await tryCreateServerSupabaseClient();
  if (!supabase) return unknownAvailability();

  const { data, error } = await supabase.rpc("get_product_availability", { p_product_ids: [id] });
  if (error) return unknownAvailability();

  const row = ((data || []) as AvailabilityRow[]).find((entry) => entry.product_id === id);
  const availability: Availability | undefined = knownAvailability.find(
    (value) => value === row?.availability,
  );
  if (!availability) return unknownAvailability();

  return NextResponse.json(
    { status: true, availability },
    { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } },
  );
}
