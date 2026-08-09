import { beforeEach, describe, expect, it, vi } from "vitest";

const { fromMock, rpcMock, sendOrderConfirmationMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  rpcMock: vi.fn(),
  sendOrderConfirmationMock: vi.fn(),
}));

vi.mock("@/lib/supabase-admin", () => ({
  isSupabaseAdminConfigured: true,
  supabaseAdmin: { from: fromMock, rpc: rpcMock },
}));

// The receipt has its own unit tests; here we only care that finalization
// triggers it and is never harmed by it.
vi.mock("@/lib/orders/order-confirmation", () => ({
  sendOrderConfirmation: sendOrderConfirmationMock,
}));

import { finalizeVerifiedOrder } from "./finalize-paid-order";

const SENT = { status: "sent", simulated: false } as const;

type Reservation = { id: string; status: string } | null;

type OrderRow = {
  customer_user_id: string | null;
  voucher_code: string | null;
  voucher_credit: number;
};

function mockSupabaseAdmin(reservation: Reservation, order?: Partial<OrderRow>) {
  const reservationMaybeSingle = vi
    .fn()
    .mockResolvedValue({ data: reservation, error: null });
  const paymentAttemptEq = vi.fn().mockResolvedValue({ error: null });
  const orderMaybeSingle = vi.fn().mockResolvedValue({
    data: {
      customer_user_id: "user-1",
      voucher_code: null,
      voucher_credit: 0,
      ...order,
    },
    error: null,
  });
  const referralsMaybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });

  fromMock.mockImplementation((table: string) => {
    if (table === "inventory_reservations") {
      return {
        select: () => ({ eq: () => ({ maybeSingle: reservationMaybeSingle }) }),
      };
    }
    if (table === "payment_attempts") {
      return { update: () => ({ eq: paymentAttemptEq }) };
    }
    if (table === "orders") {
      return {
        select: () => ({ eq: () => ({ maybeSingle: orderMaybeSingle }) }),
      };
    }
    if (table === "referrals") {
      return {
        select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: referralsMaybeSingle }) }) }),
      };
    }
    throw new Error(`Unexpected table: ${table}`);
  });

  rpcMock.mockResolvedValue({ data: null, error: null });

  return { reservationMaybeSingle, paymentAttemptEq, orderMaybeSingle, referralsMaybeSingle };
}

describe("finalizeVerifiedOrder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sendOrderConfirmationMock.mockResolvedValue(SENT);
  });

  it("finalizes through the reservation RPC when a reservation exists", async () => {
    const { paymentAttemptEq } = mockSupabaseAdmin({
      id: "reservation-1",
      status: "active",
    });

    const result = await finalizeVerifiedOrder("order-1", "ref_123");

    expect(result).toEqual({ error: null, promotionError: null, voucherError: null, referralError: null, confirmation: SENT });
    expect(rpcMock).toHaveBeenCalledWith("finalize_checkout_reservation", {
      p_reservation_id: "reservation-1",
      p_order_id: "order-1",
    });
    expect(rpcMock).toHaveBeenCalledWith("record_order_promotion_redemptions", {
      p_order_id: "order-1",
    });
    expect(paymentAttemptEq).toHaveBeenCalledWith("provider_reference", "ref_123");
    expect(fromMock).toHaveBeenCalledWith("payment_attempts");
  });

  it("falls back to finalize_paid_order when no reservation exists", async () => {
    mockSupabaseAdmin(null);

    const result = await finalizeVerifiedOrder("order-1", "ref_123");

    expect(result).toEqual({ error: null, promotionError: null, voucherError: null, referralError: null, confirmation: SENT });
    expect(rpcMock).toHaveBeenCalledWith("finalize_paid_order", {
      p_order_id: "order-1",
    });
    expect(rpcMock).not.toHaveBeenCalledWith(
      "finalize_checkout_reservation",
      expect.anything()
    );
  });

  it("converges safely when called again for an already-finalized order", async () => {
    mockSupabaseAdmin(null);

    const first = await finalizeVerifiedOrder("order-1", "ref_123");
    const second = await finalizeVerifiedOrder("order-1", "ref_123");

    // Idempotency lives in the database RPCs; retries must keep succeeding
    // with identical arguments so webhook and verify paths can both converge.
    expect(first).toEqual({ error: null, promotionError: null, voucherError: null, referralError: null, confirmation: SENT });
    expect(second).toEqual({ error: null, promotionError: null, voucherError: null, referralError: null, confirmation: SENT });
    // Three RPCs per finalize: the order itself, promotion bookkeeping, then
    // the profit-report refresh that keeps the dashboard's materialized view
    // from disagreeing with the KPI tiles.
    expect(rpcMock).toHaveBeenCalledTimes(6);
    expect(rpcMock).toHaveBeenNthCalledWith(1, "finalize_paid_order", {
      p_order_id: "order-1",
    });
    expect(rpcMock).toHaveBeenNthCalledWith(4, "finalize_paid_order", {
      p_order_id: "order-1",
    });
    expect(rpcMock).toHaveBeenCalledWith("refresh_daily_profit");
  });

  it("surfaces reservation lookup errors", async () => {
    const lookupError = { message: "database unavailable" };
    fromMock.mockImplementation(() => ({
      select: () => ({
        eq: () => ({
          maybeSingle: vi
            .fn()
            .mockResolvedValue({ data: null, error: lookupError }),
        }),
      }),
    }));

    const result = await finalizeVerifiedOrder("order-1", "ref_123");

    expect(result.error).toEqual(lookupError);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("surfaces finalize RPC errors and skips bookkeeping", async () => {
    const rpcError = { message: "finalize failed" };
    mockSupabaseAdmin(null);
    rpcMock.mockResolvedValueOnce({ data: null, error: rpcError });

    const result = await finalizeVerifiedOrder("order-1", "ref_123");

    expect(result.error).toEqual(rpcError);
    expect(fromMock).not.toHaveBeenCalledWith("payment_attempts");
    expect(rpcMock).not.toHaveBeenCalledWith(
      "record_order_promotion_redemptions",
      expect.anything()
    );
  });

  it("reports promotion bookkeeping errors without failing the order", async () => {
    const promotionError = { message: "promotion insert failed" };
    mockSupabaseAdmin(null);
    rpcMock
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: null, error: promotionError });

    const result = await finalizeVerifiedOrder("order-1", "ref_123");

    expect(result).toEqual({ error: null, promotionError, voucherError: null, referralError: null, confirmation: SENT });
  });

  it("emails the customer their receipt once the order is paid", async () => {
    mockSupabaseAdmin(null);

    await finalizeVerifiedOrder("order-1", "ref_123");

    expect(sendOrderConfirmationMock).toHaveBeenCalledTimes(1);
    expect(sendOrderConfirmationMock).toHaveBeenCalledWith("order-1");
  });

  it("does not send a receipt when finalization itself failed", async () => {
    mockSupabaseAdmin(null);
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: "finalize failed" } });

    await finalizeVerifiedOrder("order-1", "ref_123");

    expect(sendOrderConfirmationMock).not.toHaveBeenCalled();
  });

  // THE BUG: `redeemOrderVoucher` bailed out whenever `customer_user_id` was
  // null, which is every guest checkout. The credit was taken off the order
  // total but the balance was never decremented and no redemption row was
  // written, so the same voucher could be spent an unlimited number of times.
  it("spends the voucher at guest checkout, where there is no signed-in user", async () => {
    mockSupabaseAdmin(null, {
      customer_user_id: null,
      voucher_code: "BB-GIFT-1",
      voucher_credit: 75,
    });

    const result = await finalizeVerifiedOrder("order-1", "ref_123");

    expect(result.voucherError).toBeNull();
    expect(rpcMock).toHaveBeenCalledWith("redeem_voucher", {
      p_code: "BB-GIFT-1",
      // `redeem_voucher` only uses the user id to prove ownership of a voucher
      // reserved for an email address; null matches nobody, so a reserved
      // voucher stays refused while an open one is deducted.
      p_user_id: null,
      p_order_id: "order-1",
      p_amount: 75,
    });
  });

  it("still spends the voucher for a signed-in shopper", async () => {
    mockSupabaseAdmin(null, { voucher_code: "BB-GIFT-2", voucher_credit: 20 });

    await finalizeVerifiedOrder("order-1", "ref_123");

    expect(rpcMock).toHaveBeenCalledWith("redeem_voucher", {
      p_code: "BB-GIFT-2",
      p_user_id: "user-1",
      p_order_id: "order-1",
      p_amount: 20,
    });
  });

  it("does not redeem when the order was quoted no voucher credit", async () => {
    mockSupabaseAdmin(null, { voucher_code: "BB-GIFT-3", voucher_credit: 0 });

    await finalizeVerifiedOrder("order-1", "ref_123");

    expect(rpcMock).not.toHaveBeenCalledWith("redeem_voucher", expect.anything());
  });

  it("treats a repeat redemption of the same order as converged, not failed", async () => {
    // /verify and the Paystack webhook both call this. The RPC refuses the
    // second redemption before it touches the balance — that refusal is the
    // retry converging and must not be reported as a bookkeeping failure.
    mockSupabaseAdmin(null, {
      customer_user_id: null,
      voucher_code: "BB-GIFT-4",
      voucher_credit: 30,
    });
    rpcMock.mockImplementation((name: string) =>
      name === "redeem_voucher"
        ? Promise.resolve({
            data: null,
            error: { code: "P0001", message: "Voucher already redeemed for this order" },
          })
        : Promise.resolve({ data: null, error: null }),
    );

    const result = await finalizeVerifiedOrder("order-1", "ref_123");

    expect(result.voucherError).toBeNull();
  });

  it("reports a genuine voucher failure without failing the order", async () => {
    mockSupabaseAdmin(null, { voucher_code: "BB-GIFT-5", voucher_credit: 30 });
    const redeemError = { code: "P0001", message: "Voucher has expired" };
    rpcMock.mockImplementation((name: string) =>
      name === "redeem_voucher"
        ? Promise.resolve({ data: null, error: redeemError })
        : Promise.resolve({ data: null, error: null }),
    );

    const result = await finalizeVerifiedOrder("order-1", "ref_123");

    expect(result.error).toBeNull();
    expect(result.voucherError).toEqual(redeemError);
  });

  it("keeps the order finalized when the receipt cannot be sent", async () => {
    // A struggling email provider must never undo a payment the customer has
    // already made.
    mockSupabaseAdmin(null);
    sendOrderConfirmationMock.mockResolvedValue({
      status: "failed",
      reason: "Resend request failed.",
    });

    const result = await finalizeVerifiedOrder("order-1", "ref_123");

    expect(result.error).toBeNull();
    expect(result.confirmation).toEqual({
      status: "failed",
      reason: "Resend request failed.",
    });
  });
});
