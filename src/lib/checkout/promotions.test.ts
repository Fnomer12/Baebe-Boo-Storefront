import { beforeEach, describe, expect, it, vi } from "vitest";

const { fromMock, rpcMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  rpcMock: vi.fn(),
}));

vi.mock("@/lib/supabase-admin", () => ({
  isSupabaseAdminConfigured: true,
  supabaseAdmin: { from: fromMock, rpc: rpcMock },
}));

import { quoteCheckoutPromotions } from "./promotions";

type Result = { data: unknown; error: unknown };
type TableResults = { list?: Result; single?: Result };

const EMPTY: Result = { data: [], error: null };

/**
 * One chainable stand-in for a PostgREST query builder.
 *
 * `list` answers a query that is awaited directly (`.eq(...).eq(...)`), `single`
 * answers one ending in `.maybeSingle()`. Which filters were used does not
 * matter here — these tests are about which promotions survive the stacking
 * rule, not about the SQL.
 */
function builder(results: TableResults) {
  const chain: Record<string, unknown> = {};
  for (const method of ["select", "eq", "ilike", "in", "order", "limit"]) {
    chain[method] = () => chain;
  }
  chain.maybeSingle = () => Promise.resolve(results.single ?? { data: null, error: null });
  chain.single = chain.maybeSingle;
  chain.then = (resolve: (value: Result) => unknown, reject?: (reason: unknown) => unknown) =>
    Promise.resolve(results.list ?? EMPTY).then(resolve, reject);
  return chain;
}

type PromotionRow = {
  id: string;
  name: string;
  promotion_type: "percentage" | "fixed_amount" | "free_shipping";
  value: number;
  status: "active";
  starts_at: string | null;
  ends_at: string | null;
  minimum_order_amount: number | null;
  usage_limit: number | null;
  per_customer_limit: number | null;
  stackable: boolean;
  automatic: boolean;
};

function promotion(overrides: Partial<PromotionRow> & { id: string }): PromotionRow {
  return {
    name: overrides.id,
    promotion_type: "percentage",
    value: 20,
    status: "active",
    starts_at: null,
    ends_at: null,
    minimum_order_amount: null,
    usage_limit: null,
    per_customer_limit: null,
    stackable: false,
    automatic: true,
    ...overrides,
  };
}

function mockCatalogue(input: {
  automatic: PromotionRow[];
  coupon?: { code: string; promotion: PromotionRow };
}) {
  fromMock.mockImplementation((table: string) => {
    if (table === "promotions") {
      return builder({
        list: { data: input.automatic, error: null },
        single: { data: input.coupon?.promotion ?? null, error: null },
      });
    }
    if (table === "promotion_codes") {
      return builder({
        single: {
          data: input.coupon
            ? {
                id: `code-${input.coupon.promotion.id}`,
                promotion_id: input.coupon.promotion.id,
                code: input.coupon.code,
                usage_count: 0,
                is_active: true,
              }
            : null,
          error: null,
        },
      });
    }
    if (table === "promotion_redemptions" || table === "promotion_products" || table === "promotion_categories") {
      return builder({ list: EMPTY });
    }
    throw new Error(`Unexpected table: ${table}`);
  });
}

// A GH₵100 basket with a GH₵35 delivery fee, for every case below.
const basket = {
  lines: [{ variantId: "variant-1", unitPrice: 100, quantity: 1 }],
  productIds: ["product-1"],
  deliveryFee: 35,
};

describe("quoteCheckoutPromotions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rpcMock.mockResolvedValue({ data: null, error: null });
  });

  // THE BUG: free delivery was chosen with a plain `.find()` and applied no
  // matter what else was on the basket, so `stackable` was skipped entirely for
  // free-delivery offers. A non-stackable 20% off and a non-stackable free
  // delivery both landed on this basket — the shop lost GH₵20 of merchandise
  // AND the GH₵35 fee, when only one of the two was ever meant to apply.
  it("does not let a non-stackable free delivery ride along with a discount", async () => {
    mockCatalogue({
      automatic: [
        promotion({ id: "twenty-off", value: 20, stackable: false }),
        promotion({ id: "free-delivery", promotion_type: "free_shipping", value: 0, stackable: false }),
      ],
    });

    const quote = await quoteCheckoutPromotions(basket);

    // Free delivery is worth GH₵35 here and the discount only GH₵20, so the
    // customer keeps the better of the two and the shop pays for one offer.
    expect(quote.discount).toBe(0);
    expect(quote.deliveryFee).toBe(0);
    expect(quote.total).toBe(100);
    expect(quote.appliedPromotions.map((applied) => applied.promotionId)).toEqual([
      "free-delivery",
    ]);
  });

  it("keeps the discount when it is worth more than the delivery it would displace", async () => {
    mockCatalogue({
      automatic: [
        promotion({ id: "fifty-off", promotion_type: "fixed_amount", value: 50, stackable: false }),
        promotion({ id: "free-delivery", promotion_type: "free_shipping", value: 0, stackable: false }),
      ],
    });

    const quote = await quoteCheckoutPromotions(basket);

    expect(quote.discount).toBe(50);
    expect(quote.deliveryFee).toBe(35);
    expect(quote.total).toBe(85);
    expect(quote.appliedPromotions.map((applied) => applied.promotionId)).toEqual(["fifty-off"]);
  });

  it("still combines two offers that both say they stack", async () => {
    mockCatalogue({
      automatic: [
        promotion({ id: "twenty-off", value: 20, stackable: true }),
        promotion({ id: "free-delivery", promotion_type: "free_shipping", value: 0, stackable: true }),
      ],
    });

    const quote = await quoteCheckoutPromotions(basket);

    expect(quote.discount).toBe(20);
    expect(quote.deliveryFee).toBe(0);
    expect(quote.total).toBe(80);
    expect(quote.appliedPromotions.map((applied) => applied.promotionId)).toEqual([
      "twenty-off",
      "free-delivery",
    ]);
  });

  it("still zeroes the fee for a free-delivery offer on its own", async () => {
    mockCatalogue({
      automatic: [
        promotion({ id: "free-delivery", promotion_type: "free_shipping", value: 0, stackable: false }),
      ],
    });

    const quote = await quoteCheckoutPromotions(basket);

    expect(quote.deliveryFee).toBe(0);
    expect(quote.total).toBe(100);
    // A free-delivery row carries no cash value, whatever the column says.
    expect(quote.appliedPromotions[0]?.value).toBe(0);
  });

  // A typed code is still preferred over an automatic free-delivery offer, but
  // it has to survive the same stacking rule as everything else.
  it("prefers a typed free-delivery code and drops the discount it cannot join", async () => {
    mockCatalogue({
      automatic: [promotion({ id: "twenty-off", value: 20, stackable: false })],
      coupon: {
        code: "SHIPFREE",
        promotion: promotion({
          id: "coupon-delivery",
          promotion_type: "free_shipping",
          value: 0,
          stackable: false,
          automatic: false,
        }),
      },
    });

    const quote = await quoteCheckoutPromotions({ ...basket, promotionCode: "shipfree" });

    expect(quote.discount).toBe(0);
    expect(quote.deliveryFee).toBe(0);
    expect(quote.promotionCodeValid).toBe(true);
    expect(quote.appliedPromotions.map((applied) => applied.code)).toEqual(["SHIPFREE"]);
  });
});
