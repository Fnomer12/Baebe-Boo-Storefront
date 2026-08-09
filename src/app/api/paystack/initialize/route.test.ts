import { beforeEach, describe, expect, it, vi } from "vitest";

const { fromMock, rpcMock, resolveCheckoutBasketMock, quoteCheckoutPromotionsMock, fetchMock } =
  vi.hoisted(() => ({
    fromMock: vi.fn(),
    rpcMock: vi.fn(),
    resolveCheckoutBasketMock: vi.fn(),
    quoteCheckoutPromotionsMock: vi.fn(),
    fetchMock: vi.fn(),
  }));

vi.mock("@/lib/supabase-admin", () => ({
  isSupabaseAdminConfigured: true,
  supabaseAdmin: { from: fromMock, rpc: rpcMock },
}));

vi.mock("@/lib/checkout/resolve-basket", async () => {
  const actual = await vi.importActual<typeof import("@/lib/checkout/resolve-basket")>(
    "@/lib/checkout/resolve-basket",
  );
  return {
    CheckoutResolutionError: actual.CheckoutResolutionError,
    parseCheckoutItems: (value: unknown) => value,
    resolveCheckoutBasket: resolveCheckoutBasketMock,
  };
});

vi.mock("@/lib/checkout/promotions", () => ({
  quoteCheckoutPromotions: quoteCheckoutPromotionsMock,
}));

vi.mock("@/lib/rate-limit", () => ({ rateLimit: () => ({ allowed: true }) }));
vi.mock("@/lib/server-env", () => ({ requireServerEnv: () => "test-paystack-secret" }));
vi.mock("@/lib/supabase/server", () => ({ tryCreateServerSupabaseClient: async () => null }));

import { POST } from "./route";

/** Every row handed to `.insert()`, keyed by table, for assertions below. */
let inserts: Record<string, unknown[]>;

function basket(branchCount: number) {
  const variants = Array.from({ length: branchCount }, (_, index) => ({
    id: `variant-${index}`,
    productId: `product-${index}`,
    price: 100,
    costPrice: 40,
    quantity: 1,
  }));
  return {
    products: variants.map((variant) => ({ id: variant.productId, name: "Bodysuit", price: 100 })),
    variants,
    inventory: variants.map((variant, index) => ({
      id: `level-${index}`,
      variant_id: variant.id,
      shop_id: `shop-${index}`,
      on_hand: 5,
      reserved: 0,
    })),
    allocation: {
      status: "allocated" as const,
      split: branchCount > 1,
      allocations: variants.map((variant, index) => ({
        branchId: `shop-${index}`,
        items: [{ variantId: variant.id, quantity: 1 }],
      })),
    },
    merchandiseTotal: 100 * branchCount,
    deliveryFee: 35,
  };
}

function mockSupabase() {
  inserts = {};
  let allocationRow = 0;
  fromMock.mockImplementation((table: string) => {
    const record = (rows: unknown) => {
      inserts[table] = [...(inserts[table] || []), ...(Array.isArray(rows) ? rows : [rows])];
    };
    return {
      insert: (rows: unknown) => {
        record(rows);
        if (table === "orders") {
          return {
            select: () => ({
              single: async () => ({
                data: { id: "order-1", order_number: "BB-1" },
                error: null,
              }),
            }),
          };
        }
        if (table === "order_items") {
          return {
            select: async () => ({
              data: (rows as Array<{ product_id: string; variant_id: string }>).map(
                (row, index) => ({
                  id: `item-${index}`,
                  product_id: row.product_id,
                  variant_id: row.variant_id,
                }),
              ),
              error: null,
            }),
          };
        }
        if (table === "fulfilment_allocations") {
          const id = `fulfilment-${allocationRow++}`;
          return { select: () => ({ single: async () => ({ data: { id }, error: null }) }) };
        }
        return Promise.resolve({ error: null });
      },
      update: () => ({ eq: async () => ({ error: null }) }),
      delete: () => ({ eq: async () => ({ error: null }) }),
    };
  });
  rpcMock.mockResolvedValue({ data: "reservation-1", error: null });
}

function checkoutRequest(overrides: Record<string, unknown> = {}) {
  return new Request("https://example.com/api/paystack/initialize", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: "ama@example.com",
      name: "Ama",
      phone: "0240000000",
      deliveryAddress: "12 Spintex Road",
      deliveryZoneId: "zone-1",
      fulfilmentType: "delivery",
      items: [{ productId: "product-0", quantity: 1 }],
      ...overrides,
    }),
  });
}

function quote(overrides: Record<string, unknown> = {}) {
  return {
    subtotal: 100,
    discount: 0,
    rewardCredit: 0,
    deliveryFee: 35,
    total: 135,
    appliedPromotionIds: [],
    appliedPromotions: [],
    promotionMessage: null,
    promotionCodeValid: true,
    voucherCode: null,
    voucherCredit: 0,
    voucherCodeValid: true,
    voucherMessage: null,
    ...overrides,
  };
}

const deliveryFeesWritten = () =>
  (inserts.fulfilment_allocations || []).map((row) => (row as { delivery_fee: number }).delivery_fee);

describe("paystack initialize", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("PAYSTACK_SECRET_KEY", "test-paystack-secret");
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        status: true,
        data: { access_code: "access-1", reference: "ref_123" },
      }),
    });
    mockSupabase();
    resolveCheckoutBasketMock.mockResolvedValue(basket(1));
    quoteCheckoutPromotionsMock.mockResolvedValue(quote());
  });

  // THE BUG: a free-delivery promotion zeroed the fee in the quote and in
  // `orders.total_amount`, but the shipment row was still written from the
  // basket's un-discounted fee. `OrderReceipt` adds those rows up, so the
  // customer's receipt showed a GH₵35 delivery charge that nobody paid.
  it("stores the delivery fee the customer was actually charged", async () => {
    quoteCheckoutPromotionsMock.mockResolvedValue(
      quote({
        deliveryFee: 0,
        total: 100,
        appliedPromotions: [
          {
            promotionId: "free-delivery",
            codeId: null,
            code: null,
            name: "Free delivery weekend",
            kind: "free_shipping",
            value: 0,
            stackable: false,
          },
        ],
      }),
    );

    const response = await POST(checkoutRequest());
    const body = await response.json();

    expect(deliveryFeesWritten()).toEqual([0]);
    expect(body.data.delivery_fee).toBe(0);
    // The stored parts have to add up to what Paystack was asked for.
    expect(body.data.total).toBe(100);
  });

  it("still stores the full fee when no promotion touched delivery", async () => {
    await POST(checkoutRequest());

    expect(deliveryFeesWritten()).toEqual([35]);
  });

  it("splits a fee across shipments to the pesewa, leaving no rounding gap", async () => {
    resolveCheckoutBasketMock.mockResolvedValue(basket(3));
    quoteCheckoutPromotionsMock.mockResolvedValue(quote({ deliveryFee: 25, total: 325 }));

    await POST(checkoutRequest());

    const fees = deliveryFeesWritten();
    expect(fees).toEqual([8.34, 8.33, 8.33]);
    expect(fees.reduce((sum, fee) => sum + fee, 0)).toBeCloseTo(25, 2);
  });

  it("charges nothing for delivery on a click-and-collect order", async () => {
    await POST(checkoutRequest({ fulfilmentType: "pickup", shopId: "shop-0" }));

    expect(deliveryFeesWritten()).toEqual([0]);
  });
});
