import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  /** Every `.eq(column, value)` applied to the shop_staff query, in order. */
  filters: [] as Array<[string, unknown]>,
  rows: vi.fn(),
}));

/**
 * A stand-in for the PostgREST builder that records the filters rather than
 * the result. What matters here is not what came back — it is whether the
 * query was scoped to the caller at all.
 */
vi.mock("@/lib/supabase/server", () => ({
  tryCreateServerSupabaseClient: async () => ({
    auth: { getUser: mocks.getUser },
    from: () => {
      const builder = {
        select: () => builder,
        eq: (column: string, value: unknown) => {
          mocks.filters.push([column, value]);
          return builder;
        },
        limit: () => mocks.rows(),
      };
      return builder;
    },
    rpc: vi.fn(),
  }),
}));

// `cache()` from React memoises per-request; in a plain test run there is no
// request scope, so it is the identity function and repeated calls re-query.
vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  return { ...actual, cache: (fn: unknown) => fn };
});

import { getCounterAuthorization } from "./authorization";

const SHOP = {
  id: "shop-alpha",
  name: "ZZQA Shop Alpha",
  location: "Alpha Road",
  database_name: "zzqa_shop_alpha",
  is_active: true,
};

const STAFF = {
  id: "staff-alpha",
  staff_name: "ZZQA Cashier Alpha",
  staff_code: "ZZQAAAAA01",
  is_active: true,
  shops: SHOP,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.filters.length = 0;
  mocks.getUser.mockResolvedValue({
    data: { user: { id: "auth-user-alpha", email: "zzqaaaaa01@counter.baebe-boo.local" } },
    error: null,
  });
  mocks.rows.mockResolvedValue({ data: [STAFF], error: null });
});

describe("getCounterAuthorization", () => {
  it("scopes the staff lookup to the signed-in user", async () => {
    // THE regression test for this file. The previous implementation selected
    // from shop_staff with a bare `.limit(1)` and no WHERE clause, trusting RLS
    // to narrow it — and RLS was off in production. Every cashier, and any
    // signed-in user at all, resolved to whichever row sorted first.
    await getCounterAuthorization();

    expect(mocks.filters).toContainEqual(["auth_user_id", "auth-user-alpha"]);
  });

  it("ignores staff who have been switched off", async () => {
    await getCounterAuthorization();

    expect(mocks.filters).toContainEqual(["is_active", true]);
  });

  it("returns the staff member's own shop", async () => {
    const authorization = await getCounterAuthorization();

    expect(authorization?.staff.code).toBe("ZZQAAAAA01");
    expect(authorization?.staff.shop.id).toBe("shop-alpha");
  });

  it("refuses a signed-in user who is not counter staff", async () => {
    // A customer holds a perfectly valid session. Before the filter they would
    // have matched row 1 of shop_staff and been handed the till.
    mocks.rows.mockResolvedValue({ data: [], error: null });

    expect(await getCounterAuthorization()).toBeNull();
  });

  it("refuses when there is no session", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });

    expect(await getCounterAuthorization()).toBeNull();
  });

  it("refuses when the shop itself is closed", async () => {
    mocks.rows.mockResolvedValue({
      data: [{ ...STAFF, shops: { ...SHOP, is_active: false } }],
      error: null,
    });

    expect(await getCounterAuthorization()).toBeNull();
  });

  it("accepts the embedded shop arriving as an array", async () => {
    // PostgREST returns an embedded to-one relation as an object or a
    // single-element array depending on how it infers the relationship.
    mocks.rows.mockResolvedValue({ data: [{ ...STAFF, shops: [SHOP] }], error: null });

    expect((await getCounterAuthorization())?.staff.shop.id).toBe("shop-alpha");
  });

  it("refuses when the lookup itself failed", async () => {
    mocks.rows.mockResolvedValue({ data: null, error: { message: "boom" } });

    expect(await getCounterAuthorization()).toBeNull();
  });
});
