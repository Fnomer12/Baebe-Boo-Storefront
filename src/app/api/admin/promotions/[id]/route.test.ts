import { beforeEach, describe, expect, it, vi } from "vitest";

const { fromMock, authorizeAdminApiMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  authorizeAdminApiMock: vi.fn(),
}));

vi.mock("@/lib/supabase-admin", () => ({
  isSupabaseAdminConfigured: true,
  supabaseAdmin: { from: fromMock },
}));

vi.mock("@/lib/auth", () => ({ authorizeAdminApi: authorizeAdminApiMock }));

import { PATCH } from "./route";

type CodeRow = {
  id: string;
  promotion_id: string;
  code: string;
  is_active: boolean;
  created_at: string;
};

const PROMOTION_ID = "promotion-1";

/**
 * A stand-in for the three tables this handler touches, with the one constraint
 * that matters: `promotion_codes.code` is unique across every promotion.
 */
let codes: CodeRow[];
let promotionUpdates: Record<string, unknown>[];
let redemptionsByCodeId: Record<string, number>;
/** Set to a code that a racing admin claims between the pre-flight and insert. */
let stolenCode: string | null;

const promotionRow = {
  id: PROMOTION_ID,
  promotion_type: "percentage",
  value: 20,
  status: "active",
  automatic: false,
  starts_at: null,
  ends_at: null,
};

function thenable(resolve: () => unknown) {
  const chain: Record<string, unknown> = {};
  const filters: Record<string, unknown> = {};
  chain.select = () => chain;
  chain.eq = (column: string, value: unknown) => {
    filters[column] = value;
    return chain;
  };
  chain.ilike = (column: string, value: unknown) => {
    filters[`ilike:${column}`] = value;
    return chain;
  };
  chain.in = (column: string, value: unknown) => {
    filters[column] = value;
    return chain;
  };
  chain.order = () => chain;
  chain.maybeSingle = async () => resolve();
  chain.then = (onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) =>
    Promise.resolve(resolve()).then(onFulfilled, onRejected);
  chain.filters = filters;
  return chain as Record<string, unknown> & { filters: Record<string, unknown> };
}

/**
 * ILIKE as Postgres means it, not as string equality.
 *
 * `_` matches any single character and `%` any run, and promotion codes are
 * allowed to contain underscores — so a lookup for `WINTER_26` really does come
 * back holding another promotion's `WINTER-26`.
 */
function ilikeMatches(value: string, pattern: string) {
  const expression = pattern
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replace(/_/g, ".")
    .replace(/[%*]/g, ".*");
  return new RegExp(`^${expression}$`, "i").test(value);
}

function mockDatabase() {
  fromMock.mockImplementation((table: string) => {
    if (table === "promotions") {
      const chain = thenable(() => ({ data: promotionRow, error: null }));
      chain.update = (values: Record<string, unknown>) => {
        promotionUpdates.push(values);
        return { eq: async () => ({ error: null }) };
      };
      return chain;
    }

    if (table === "promotion_codes") {
      const chain = thenable(() => {
        const wanted = chain.filters["ilike:code"];
        if (typeof wanted === "string") {
          return { data: codes.filter((row) => ilikeMatches(row.code, wanted)), error: null };
        }
        return {
          data: codes.filter((row) => row.promotion_id === chain.filters.promotion_id),
          error: null,
        };
      });
      chain.delete = () => ({
        eq: async (_column: string, value: string) => {
          codes = codes.filter((row) => row.promotion_id !== value);
          return { error: null };
        },
      });
      chain.insert = async (row: { promotion_id: string; code: string }) => {
        const taken =
          codes.some((existing) => existing.code.toLowerCase() === row.code.toLowerCase()) ||
          stolenCode?.toLowerCase() === row.code.toLowerCase();
        if (taken) return { error: { code: "23505", message: "duplicate key value" } };
        codes.push({
          id: `code-${codes.length + 1}`,
          promotion_id: row.promotion_id,
          code: row.code,
          is_active: true,
          created_at: new Date().toISOString(),
        });
        return { error: null };
      };
      return chain;
    }

    if (table === "promotion_redemptions") {
      const chain = thenable(() => {
        const ids = (chain.filters.promotion_code_id as string[]) || [];
        const count = ids.reduce((sum, id) => sum + (redemptionsByCodeId[id] || 0), 0);
        return { count, error: null };
      });
      return chain;
    }

    throw new Error(`Unexpected table: ${table}`);
  });
}

function patchRequest(body: unknown) {
  return new Request(`https://example.com/api/admin/promotions/${PROMOTION_ID}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const params = Promise.resolve({ id: PROMOTION_ID });
const codesFor = (promotionId: string) =>
  codes.filter((row) => row.promotion_id === promotionId).map((row) => row.code);

describe("PATCH /api/admin/promotions/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authorizeAdminApiMock.mockResolvedValue({ authorized: true });
    promotionUpdates = [];
    redemptionsByCodeId = {};
    stolenCode = null;
    codes = [
      {
        id: "code-1",
        promotion_id: PROMOTION_ID,
        code: "SUMMER26",
        is_active: true,
        created_at: "2026-07-01T00:00:00.000Z",
      },
      {
        id: "code-other",
        promotion_id: "promotion-2",
        code: "WINTER26",
        is_active: true,
        created_at: "2026-07-01T00:00:00.000Z",
      },
    ];
    mockDatabase();
  });

  // THE BUG: the replacement was tried only after the promotion row had been
  // saved and the old code deleted. A collision — `code` is unique across every
  // promotion — therefore destroyed a working code and left a live promotion
  // with no way for any customer to reach it.
  it("keeps the working code when the replacement is already taken", async () => {
    const response = await PATCH(patchRequest({ code: "WINTER26" }), { params });

    expect(response.status).toBe(409);
    expect(codesFor(PROMOTION_ID)).toEqual(["SUMMER26"]);
    // And nothing else was half-saved either.
    expect(promotionUpdates).toEqual([]);
  });

  it("swaps the code when nothing else holds it", async () => {
    const response = await PATCH(patchRequest({ code: "autumn26" }), { params });

    expect(response.status).toBe(200);
    expect(codesFor(PROMOTION_ID)).toEqual(["AUTUMN26"]);
  });

  it("puts the old code back when a racing admin claims the new one", async () => {
    // The pre-flight sees the code as free; it is taken before the insert runs.
    stolenCode = "AUTUMN26";

    const response = await PATCH(patchRequest({ code: "autumn26" }), { params });

    expect(response.status).toBe(409);
    expect(codesFor(PROMOTION_ID)).toEqual(["SUMMER26"]);
  });

  // THE OTHER BUG: the list endpoint skips `is_active = false` rows and this
  // handler did not, so the two disagreed about which code a promotion has. An
  // admin resaving the code the workspace showed them looked like a code
  // change, and here that means a used code being replaced — refused outright.
  it("compares against the live code, not a deactivated one", async () => {
    codes.unshift({
      id: "code-retired",
      promotion_id: PROMOTION_ID,
      code: "SPRING26",
      is_active: false,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    redemptionsByCodeId["code-retired"] = 3;

    const response = await PATCH(patchRequest({ code: "SUMMER26", name: "Renamed" }), { params });

    expect(response.status).toBe(200);
    // Nothing about the codes changed, because nothing about them was asked to.
    expect(codesFor(PROMOTION_ID)).toEqual(["SPRING26", "SUMMER26"]);
    expect(promotionUpdates[0]?.name).toBe("Renamed");
  });

  // The collision pre-flight asks the database with ILIKE, where `_` matches
  // any single character — and codes may contain underscores. WINTER_26 is not
  // WINTER-26, and refusing it would block a perfectly good code.
  it("does not mistake an underscore for a wildcard match on another code", async () => {
    codes.push({
      id: "code-dashed",
      promotion_id: "promotion-3",
      code: "WINTER-26",
      is_active: true,
      created_at: "2026-07-01T00:00:00.000Z",
    });

    const response = await PATCH(patchRequest({ code: "WINTER_26" }), { params });

    expect(response.status).toBe(200);
    expect(codesFor(PROMOTION_ID)).toEqual(["WINTER_26"]);
  });

  it("still refuses to change a code customers have already used", async () => {
    redemptionsByCodeId["code-1"] = 2;

    const response = await PATCH(patchRequest({ code: "AUTUMN26" }), { params });

    expect(response.status).toBe(409);
    expect(codesFor(PROMOTION_ID)).toEqual(["SUMMER26"]);
  });

  it("clears the code when the admin empties the field", async () => {
    const response = await PATCH(patchRequest({ code: "", automatic: true }), { params });

    expect(response.status).toBe(200);
    expect(codesFor(PROMOTION_ID)).toEqual([]);
  });
});
