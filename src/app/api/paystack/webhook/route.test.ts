import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const PAYSTACK_SECRET = "test-paystack-secret";

const { maybeSingleMock, finalizeVerifiedOrderMock } = vi.hoisted(() => ({
  maybeSingleMock: vi.fn(),
  finalizeVerifiedOrderMock: vi.fn(),
}));

vi.mock("@/lib/supabase-admin", () => ({
  isSupabaseAdminConfigured: true,
  supabaseAdmin: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({ maybeSingle: maybeSingleMock })),
          maybeSingle: maybeSingleMock,
        })),
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
  payment_status: "pending",
};

const CHARGE_SUCCESS = {
  event: "charge.success",
  data: {
    reference: "ref_123",
    status: "success",
    amount: 25000,
    currency: "GHS",
    metadata: { order_id: "order-1" },
  },
};

function webhookRequest(payload: unknown, secret: string | null = PAYSTACK_SECRET) {
  const rawBody = JSON.stringify(payload);
  const headers = new Headers();
  if (secret !== null) {
    headers.set(
      "x-paystack-signature",
      createHmac("sha512", secret).update(rawBody).digest("hex")
    );
  }
  return new Request("https://example.com/api/paystack/webhook", {
    method: "POST",
    headers,
    body: rawBody,
  });
}

describe("paystack webhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("PAYSTACK_SECRET_KEY", PAYSTACK_SECRET);
    maybeSingleMock.mockResolvedValue({ data: ORDER, error: null });
    finalizeVerifiedOrderMock.mockResolvedValue({
      error: null,
      promotionError: null,
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("finalizes the order for a valid signature with matching amount and currency", async () => {
    const response = await POST(webhookRequest(CHARGE_SUCCESS));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ received: true });
    expect(finalizeVerifiedOrderMock).toHaveBeenCalledWith("order-1", "ref_123");
  });

  it("rejects an invalid signature without touching the database", async () => {
    const response = await POST(webhookRequest(CHARGE_SUCCESS, "wrong-secret"));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ received: false });
    expect(maybeSingleMock).not.toHaveBeenCalled();
    expect(finalizeVerifiedOrderMock).not.toHaveBeenCalled();
  });

  it("rejects a missing signature", async () => {
    const response = await POST(webhookRequest(CHARGE_SUCCESS, null));

    expect(response.status).toBe(401);
    expect(finalizeVerifiedOrderMock).not.toHaveBeenCalled();
  });

  it("rejects an amount mismatch", async () => {
    const payload = {
      ...CHARGE_SUCCESS,
      data: { ...CHARGE_SUCCESS.data, amount: 100 },
    };

    const response = await POST(webhookRequest(payload));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ received: false });
    expect(finalizeVerifiedOrderMock).not.toHaveBeenCalled();
  });

  it("rejects a currency mismatch", async () => {
    const payload = {
      ...CHARGE_SUCCESS,
      data: { ...CHARGE_SUCCESS.data, currency: "NGN" },
    };

    const response = await POST(webhookRequest(payload));

    expect(response.status).toBe(400);
    expect(finalizeVerifiedOrderMock).not.toHaveBeenCalled();
  });

  it("acknowledges an already-paid order without re-finalizing", async () => {
    maybeSingleMock.mockResolvedValue({
      data: { ...ORDER, payment_status: "paid" },
      error: null,
    });

    const response = await POST(webhookRequest(CHARGE_SUCCESS));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ received: true });
    expect(finalizeVerifiedOrderMock).not.toHaveBeenCalled();
  });

  it("returns 404 when the reference matches no order", async () => {
    maybeSingleMock.mockResolvedValue({ data: null, error: null });

    const response = await POST(webhookRequest(CHARGE_SUCCESS));

    expect(response.status).toBe(404);
    expect(finalizeVerifiedOrderMock).not.toHaveBeenCalled();
  });

  it("acknowledges non-charge.success events without finalizing", async () => {
    const payload = { event: "charge.failed", data: CHARGE_SUCCESS.data };

    const response = await POST(webhookRequest(payload));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ received: true });
    expect(finalizeVerifiedOrderMock).not.toHaveBeenCalled();
  });

  it("returns 500 when finalization fails", async () => {
    finalizeVerifiedOrderMock.mockResolvedValue({
      error: { message: "rpc failed" },
      promotionError: null,
    });

    const response = await POST(webhookRequest(CHARGE_SUCCESS));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ received: false });
  });
});
