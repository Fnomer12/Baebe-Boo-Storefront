import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpcMock, fromMock, createClientMock, adminFromMock } = vi.hoisted(() => ({
  rpcMock: vi.fn(),
  fromMock: vi.fn(),
  createClientMock: vi.fn(),
  adminFromMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: createClientMock,
  tryCreateServerSupabaseClient: createClientMock,
}));

// The service key is deliberately absent: this page must recommend without one.
vi.mock("@/lib/supabase-admin", () => ({
  isSupabaseAdminConfigured: false,
  supabaseAdmin: { from: adminFromMock, rpc: vi.fn() },
}));

import { loadFrequentlyBoughtTogether } from "./storefront-product";

const PRODUCT_ID = "c1a21cf2-6c41-45e9-92f2-30ab037e9b80";
const HAT = "eb5ad404-2adc-4d3a-9052-a05ca78216db";
const BIB = "3da34dab-4002-4474-a7af-4bb09f46c5ca";

function catalogRow(id: string, name: string, price: number) {
  return {
    id,
    name,
    category: "Baby Clothing",
    age_range: "0–3 Months",
    gender: "Unisex",
    price,
    image_url: "",
    description: null,
  };
}

/** A `products` select that resolves to the given rows however it is chained. */
function productsTable(rows: unknown[]) {
  const result = { data: rows, error: null };
  const chain = {
    select: () => chain,
    in: () => chain,
    eq: () => Promise.resolve(result),
    then: (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve),
  };
  return chain;
}

describe("loadFrequentlyBoughtTogether", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createClientMock.mockResolvedValue({ rpc: rpcMock, from: fromMock });
    fromMock.mockImplementation(() =>
      productsTable([catalogRow(HAT, "Sun Hat", 45), catalogRow(BIB, "Cotton Bib", 30)]),
    );
  });

  it("recommends without a service key, by asking the database", async () => {
    // Regression: this reimplemented `get_frequently_bought_together` as three
    // service-role round trips per product page view, and returned nothing at
    // all when SUPABASE_SECRET_KEY was absent — even though the function is
    // granted to `anon` and a shopper can call it themselves.
    rpcMock.mockResolvedValue({
      data: [
        { product_id: BIB, purchase_count: 9 },
        { product_id: HAT, purchase_count: 4 },
      ],
      error: null,
    });

    const products = await loadFrequentlyBoughtTogether(PRODUCT_ID);

    expect(rpcMock).toHaveBeenCalledWith("get_frequently_bought_together", {
      p_product_id: PRODUCT_ID,
      p_limit: 4,
    });
    // The RPC's order is the recommendation, so the bib leads.
    expect(products.map((product) => product.id)).toEqual([BIB, HAT]);
    expect(products[0].name).toBe("Cotton Bib");
    // No admin client was touched — one round trip for the ranking, one for the rows.
    expect(adminFromMock).not.toHaveBeenCalled();
    expect(fromMock).toHaveBeenCalledTimes(1);
  });

  it("omits the strip rather than inventing one when nothing co-occurs", async () => {
    rpcMock.mockResolvedValue({ data: [], error: null });

    expect(await loadFrequentlyBoughtTogether(HAT)).toEqual([]);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("omits the strip when the query fails", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: "boom" } });

    expect(await loadFrequentlyBoughtTogether(BIB)).toEqual([]);
  });
});
