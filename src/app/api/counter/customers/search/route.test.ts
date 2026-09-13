import { beforeEach, describe, expect, it, vi } from "vitest";

vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://baebe-boo.jtechinnovations.tech");

const { selectMock } = vi.hoisted(() => ({ selectMock: vi.fn() }));

vi.mock("@/lib/auth", () => ({
  authorizeCounterApi: async () => ({ authorized: true }),
}));

vi.mock("@/lib/supabase-admin", () => ({
  supabaseAdmin: { from: (table: string) => selectMock(table) },
}));

import { GET } from "./route";

const STAFF_ID = "22222222-2222-4222-8222-222222222222";

function searchRequest(q: string) {
  return new Request(`https://example.com/api/counter/customers/search?q=${encodeURIComponent(q)}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  selectMock.mockImplementation((table: string) => {
    if (table === "shop_staff") {
      return {
        select: () => ({
          not: async () => ({ data: [{ auth_user_id: STAFF_ID }], error: null }),
        }),
      };
    }
    return {
      select: () => ({
        or: () => ({
          limit: async () => ({
            data: [
              {
                user_id: STAFF_ID,
                full_name: "Till Cashier",
                email: "bb1a@counter.baebe-boo.jtechinnovations.tech",
                phone: "0241111111",
              },
              {
                user_id: "33333333-3333-4333-8333-333333333333",
                full_name: "Ama Mensah",
                email: "ama@example.com",
                phone: "0241234567",
              },
            ],
            error: null,
          }),
        }),
      }),
    };
  });
});

describe("counter customer search staff exclusion", () => {
  it("hides till logins from member lookup", async () => {
    const response = await GET(searchRequest("0241"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.customers).toHaveLength(1);
    expect(body.customers[0]).toMatchObject({ email: "ama@example.com" });
  });

  it("returns nothing useful for short queries", async () => {
    const response = await GET(searchRequest("02"));
    expect(await response.json()).toEqual({ customers: [] });
  });
});
