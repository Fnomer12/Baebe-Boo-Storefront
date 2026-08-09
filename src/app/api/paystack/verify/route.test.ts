import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const PAYSTACK_SECRET = "test-paystack-secret";

const { maybeSingleMock, finalizeVerifiedOrderMock, fetchMock } = vi.hoisted(
  () => ({
    maybeSingleMock: vi.fn(),
    finalizeVerifiedOrderMock: vi.fn(),
    fetchMock: vi.fn(),
  })
);

vi.mock("@/lib/supabase-admin", () => ({
  isSupabaseAdminConfigured: true,
  supabaseAdmin: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({ maybeSingle: maybeSingleMock })),
      })),
    })),
  },
}));

vi.mock("@/lib/orders/finalize-paid-order", () => ({
  finalizeVerifiedOrder: finalizeVerifiedOrderMock,
}));

import { POST } from "./route";

const ORDER = {
  id: "order-1",
  total_amount: 250,
  payment_reference: "ref_123",
  payment_status: "pending",
};

function paystackSuccess(overrides: Record<string, unknown> = {}) {
  return {
    status: true,
    data: {
      status: "success",
      amount: 25000,
      currency: "GHS",
      reference: "ref_123",
      metadata: { order_id: "order-1" },
      ...overrides,
    },
  };
}

function verifyRequest(body: unknown) {
  return new Request("https://example.com/api/paystack/verify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("paystack verify", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("PAYSTACK_SECRET_KEY", PAYSTACK_SECRET);
    vi.stubGlobal("fetch", fetchMock);
    maybeSingleMock.mockResolvedValue({ data: ORDER, error: null });
    finalizeVerifiedOrderMock.mockResolvedValue({
      error: null,
      promotionError: null,
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("finalizes the order when Paystack confirms the payment", async () => {
    fetchMock.mockResolvedValue({ json: async () => paystackSuccess() });

    const response = await POST(
      verifyRequest({ reference: "ref_123", orderId: "order-1" })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: true,
      reference: "ref_123",
      order_id: "order-1",
    });
    expect(finalizeVerifiedOrderMock).toHaveBeenCalledWith("order-1", "ref_123");
  });

  it("rejects when the paid amount does not match the order total", async () => {
    fetchMock.mockResolvedValue({
      json: async () => paystackSuccess({ amount: 100 }),
    });

    const response = await POST(
      verifyRequest({ reference: "ref_123", orderId: "order-1" })
    );

    await expect(response.json()).resolves.toEqual({
      status: false,
      message: "Payment not verified",
    });
    expect(finalizeVerifiedOrderMock).not.toHaveBeenCalled();
  });

  it("rejects when the metadata order_id does not match the order", async () => {
    fetchMock.mockResolvedValue({
      json: async () => paystackSuccess({ metadata: { order_id: "order-2" } }),
    });

    const response = await POST(
      verifyRequest({ reference: "ref_123", orderId: "order-1" })
    );

    await expect(response.json()).resolves.toEqual({
      status: false,
      message: "Payment not verified",
    });
    expect(finalizeVerifiedOrderMock).not.toHaveBeenCalled();
  });

  it("rejects when the currency is not GHS", async () => {
    fetchMock.mockResolvedValue({
      json: async () => paystackSuccess({ currency: "NGN" }),
    });

    const response = await POST(
      verifyRequest({ reference: "ref_123", orderId: "order-1" })
    );

    await expect(response.json()).resolves.toEqual({
      status: false,
      message: "Payment not verified",
    });
    expect(finalizeVerifiedOrderMock).not.toHaveBeenCalled();
  });

  it("returns 400 when the reference belongs to a different order", async () => {
    maybeSingleMock.mockResolvedValue({
      data: { ...ORDER, payment_reference: "ref_other" },
      error: null,
    });

    const response = await POST(
      verifyRequest({ reference: "ref_123", orderId: "order-1" })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      status: false,
      message: "Payment does not match an order.",
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(finalizeVerifiedOrderMock).not.toHaveBeenCalled();
  });

  it("acknowledges an already-paid order without calling Paystack", async () => {
    maybeSingleMock.mockResolvedValue({
      data: { ...ORDER, payment_status: "paid" },
      error: null,
    });

    const response = await POST(
      verifyRequest({ reference: "ref_123", orderId: "order-1" })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: true,
      reference: "ref_123",
      order_id: "order-1",
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(finalizeVerifiedOrderMock).not.toHaveBeenCalled();
  });
});
