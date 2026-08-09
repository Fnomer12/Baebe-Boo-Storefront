import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpcMock, createClientMock } = vi.hoisted(() => ({
  rpcMock: vi.fn(),
  createClientMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  tryCreateServerSupabaseClient: createClientMock,
}));

import { GET } from "./route";

const PRODUCT_ID = "c1a21cf2-6c41-45e9-92f2-30ab037e9b80";

async function availabilityFor(id = PRODUCT_ID) {
  const response = await GET(new Request(`https://example.com/api/products/${id}/availability`), {
    params: Promise.resolve({ id }),
  });
  return (await response.json()) as { status: boolean; availability: string };
}

describe("product availability route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createClientMock.mockResolvedValue({ rpc: rpcMock });
  });

  it("reports unknown, not out of stock, when the database has no answer", async () => {
    // Regression: a product with no rows behind it was reported `out_of_stock`,
    // which disables Add to bag and Buy now. `get_product_availability` returns
    // NO ROW for a product it cannot judge — one with no variants, or variants
    // with no inventory levels — and that silence means "confirm at checkout",
    // never "we will not sell you this".
    rpcMock.mockResolvedValue({ data: [], error: null });

    expect(await availabilityFor()).toEqual({ status: true, availability: "unknown" });
    expect(rpcMock).toHaveBeenCalledWith("get_product_availability", {
      p_product_ids: [PRODUCT_ID],
    });
  });

  it("ignores rows about other products", async () => {
    rpcMock.mockResolvedValue({
      data: [{ product_id: "eb5ad404-2adc-4d3a-9052-a05ca78216db", availability: "out_of_stock" }],
      error: null,
    });

    expect(await availabilityFor()).toEqual({ status: true, availability: "unknown" });
  });

  it("passes the database's verdict through", async () => {
    rpcMock.mockResolvedValue({
      data: [{ product_id: PRODUCT_ID, availability: "low_stock" }],
      error: null,
    });

    expect(await availabilityFor()).toEqual({ status: true, availability: "low_stock" });
  });

  it("still reports a genuine sell-out", async () => {
    rpcMock.mockResolvedValue({
      data: [{ product_id: PRODUCT_ID, availability: "out_of_stock" }],
      error: null,
    });

    expect(await availabilityFor()).toEqual({ status: true, availability: "out_of_stock" });
  });

  it("degrades to unknown when the query fails", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: "boom" } });

    expect(await availabilityFor()).toEqual({ status: true, availability: "unknown" });
  });

  it("degrades to unknown when Supabase is not configured", async () => {
    createClientMock.mockResolvedValue(null);

    expect(await availabilityFor()).toEqual({ status: true, availability: "unknown" });
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("does not cache a degraded answer", async () => {
    // A minute of CDN caching would spread one transient failure across every
    // shopper who asks about this product.
    rpcMock.mockResolvedValue({ data: null, error: { message: "boom" } });
    const degraded = await GET(new Request("https://example.com/x"), {
      params: Promise.resolve({ id: PRODUCT_ID }),
    });
    expect(degraded.headers.get("Cache-Control")).toBeNull();

    rpcMock.mockResolvedValue({
      data: [{ product_id: PRODUCT_ID, availability: "in_stock" }],
      error: null,
    });
    const answered = await GET(new Request("https://example.com/x"), {
      params: Promise.resolve({ id: PRODUCT_ID }),
    });
    expect(answered.headers.get("Cache-Control")).toContain("s-maxage=60");
  });
});
