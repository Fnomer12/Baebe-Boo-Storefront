// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { authorizeMock, getReceiptMock, fromMock } = vi.hoisted(() => ({
  authorizeMock: vi.fn(),
  getReceiptMock: vi.fn(),
  fromMock: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ authorizeCounterApi: authorizeMock }));
vi.mock("@/lib/counter/sales", () => ({ getCounterSaleReceipt: getReceiptMock }));
vi.mock("@/lib/supabase-admin", () => ({
  isSupabaseAdminConfigured: true,
  supabaseAdmin: { from: fromMock },
}));

import { GET } from "./route";

const SALE_ID = "11111111-1111-4111-8111-111111111111";

function authorized() {
  authorizeMock.mockResolvedValue({
    authorized: true,
    counter: { staff: { id: "staff-1", shop: { id: "shop-1", name: "Osu", location: "Osu, Accra" } } },
  });
  getReceiptMock.mockResolvedValue({
    id: SALE_ID,
    orderNumber: "BB-POS-1",
    customerName: "Ama",
    customerPhone: "",
    paymentMethod: "cash",
    total: 189,
    soldAt: new Date("2026-09-04T10:30:00Z").toISOString(),
    isMine: true,
    lines: [
      { id: "line-1", productName: "Romper", variantLabel: "Blue", quantity: 1, price: 189, lineTotal: 189 },
    ],
  });
  fromMock.mockImplementation(() => ({
    select: () => ({
      eq: () => ({
        maybeSingle: async () => ({ data: { name: "Osu", location: "Osu, Accra" }, error: null }),
      }),
    }),
  }));
}

describe("counter receipt pdf route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authorized();
  });

  it("returns a PDF receipt for the cashier's own shop", async () => {
    const response = await GET(new Request("https://example.com/x"), { params: Promise.resolve({ id: SALE_ID }) });

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/pdf");
    const bytes = Buffer.from(await response.arrayBuffer());
    expect(bytes.subarray(0, 4).toString()).toBe("%PDF");
  });

  it("rejects a non-UUID id without touching the database", async () => {
    const response = await GET(new Request("https://example.com/x"), { params: Promise.resolve({ id: "nope" }) });

    expect(response.status).toBe(404);
    expect(getReceiptMock).not.toHaveBeenCalled();
  });

  it("passes counter auth failures through", async () => {
    authorizeMock.mockResolvedValue({
      authorized: false,
      response: new Response("no", { status: 401 }),
    });
    const response = await GET(new Request("https://example.com/x"), { params: Promise.resolve({ id: SALE_ID }) });

    expect(response.status).toBe(401);
  });
});
