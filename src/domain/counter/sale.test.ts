import { describe, expect, it, vi } from "vitest";
import { completeCounterSale, normalizeSaleItems } from "./sale";

describe("normalizeSaleItems", () => {
  it("collapses duplicate variants", () => {
    expect(
      normalizeSaleItems([
        { variantId: "a", quantity: 1 },
        { variantId: "a", quantity: 2 },
      ]),
    ).toEqual([{ variantId: "a", quantity: 3 }]);
  });

  it("drops non-positive quantities", () => {
    expect(
      normalizeSaleItems([
        { variantId: "a", quantity: 0 },
        { variantId: "b", quantity: -2 },
        { variantId: "c", quantity: 1 },
      ]),
    ).toEqual([{ variantId: "c", quantity: 1 }]);
  });

  it("floors fractional quantities", () => {
    expect(normalizeSaleItems([{ variantId: "a", quantity: 2.7 }])).toEqual([
      { variantId: "a", quantity: 2 },
    ]);
  });

  it("orders deterministically so retries send an identical body", () => {
    const first = normalizeSaleItems([
      { variantId: "b", quantity: 1 },
      { variantId: "a", quantity: 1 },
    ]);
    const second = normalizeSaleItems([
      { variantId: "a", quantity: 1 },
      { variantId: "b", quantity: 1 },
    ]);
    expect(first).toEqual(second);
    expect(first.map((item) => item.variantId)).toEqual(["a", "b"]);
  });
});

describe("completeCounterSale", () => {
  const input = {
    staffId: "staff-1",
    items: [{ variantId: "variant-1", quantity: 2 }],
    paymentMethod: "cash" as const,
  };

  it("sends snake_case RPC arguments", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ order_id: "order-1", order_number: "BB-POS-1" }],
      error: null,
    });

    await completeCounterSale({ rpc }, { ...input, idempotencyKey: "key-1" });

    expect(rpc).toHaveBeenCalledWith("complete_counter_sale", {
      p_staff_id: "staff-1",
      p_items: [{ variant_id: "variant-1", quantity: 2 }],
      p_payment_method: "cash",
      p_customer_name: "Walk-in Customer",
      p_customer_phone: "",
      p_idempotency_key: "key-1",
    });
  });

  it("never passes a shop id — the database derives it from the session", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{ order_id: "o", order_number: "n" }], error: null });
    await completeCounterSale({ rpc }, input);
    const args = rpc.mock.calls[0][1] as Record<string, unknown>;
    expect(Object.keys(args)).not.toContain("p_shop_id");
  });

  it("unwraps the single row a returns-table RPC produces", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ order_id: "order-1", order_number: "BB-POS-1" }],
      error: null,
    });
    const result = await completeCounterSale({ rpc }, input);
    expect(result.sale).toEqual({ orderId: "order-1", orderNumber: "BB-POS-1" });
    expect(result.error).toBeNull();
  });

  it("refuses an empty cart without calling the database", async () => {
    const rpc = vi.fn();
    const result = await completeCounterSale({ rpc }, { ...input, items: [] });
    expect(rpc).not.toHaveBeenCalled();
    expect(result.sale).toBeNull();
    expect(result.error?.message).toMatch(/at least one item/i);
  });

  it("refuses a cart whose quantities all normalize away", async () => {
    const rpc = vi.fn();
    const result = await completeCounterSale({ rpc }, {
      ...input,
      items: [{ variantId: "variant-1", quantity: 0 }],
    });
    expect(rpc).not.toHaveBeenCalled();
    expect(result.sale).toBeNull();
  });

  it("surfaces the database error code so the caller can react to it", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "Insufficient inventory for variant x", code: "P0001" },
    });
    const result = await completeCounterSale({ rpc }, input);
    expect(result.sale).toBeNull();
    expect(result.error).toEqual({ message: "Insufficient inventory for variant x", code: "P0001" });
  });

  it("treats a response with no order as an error", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [], error: null });
    const result = await completeCounterSale({ rpc }, input);
    expect(result.sale).toBeNull();
    expect(result.error?.message).toMatch(/did not return an order/i);
  });

  it("trims the customer name and falls back to the walk-in label", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{ order_id: "o", order_number: "n" }], error: null });
    await completeCounterSale({ rpc }, { ...input, customerName: "  Ama  " });
    expect((rpc.mock.calls[0][1] as Record<string, unknown>).p_customer_name).toBe("Ama");

    rpc.mockClear();
    await completeCounterSale({ rpc }, { ...input, customerName: "   " });
    expect((rpc.mock.calls[0][1] as Record<string, unknown>).p_customer_name).toBe("Walk-in Customer");
  });
});
