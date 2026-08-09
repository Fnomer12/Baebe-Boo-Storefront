import { describe, expect, it, vi } from "vitest";

// The module reaches Supabase at import time only through these two, and none
// of the pure helpers below touch them.
vi.mock("@/lib/supabase-admin", () => ({
  isSupabaseAdminConfigured: true,
  supabaseAdmin: {},
}));
vi.mock("@/lib/supabase/server", () => ({
  tryCreateServerSupabaseClient: async () => null,
}));

import {
  formatReceiptDate,
  formatReceiptDateTime,
  receiptTotals,
  statusLabel,
  type ReceiptOrder,
} from "./receipt-order";

function makeOrder(overrides: Partial<ReceiptOrder> = {}): ReceiptOrder {
  return {
    id: "order-1",
    orderNumber: "BB-1001",
    recordCode: null,
    customerName: "Ama Mensah",
    customerEmail: "ama@example.com",
    customerPhone: "+233240000000",
    deliveryAddress: "12 Oxford Street, Osu",
    digitalAddress: null,
    orderStatus: "received",
    paymentStatus: "paid",
    orderType: "online",
    totalAmount: 0,
    voucherCredit: 0,
    createdAt: "2026-08-08T21:26:09.387Z",
    shop: null,
    items: [
      { id: "i1", productName: "Cotton Sleepsuit", quantity: 2, unitPrice: 100, totalPrice: 200 },
    ],
    payments: [],
    appliedDiscount: 0,
    deliveryFee: 0,
    ...overrides,
  };
}

/**
 * `receiptTotals` is the single source of the number a customer sees. The web
 * receipt, the emailed receipt and the PDF all read it, because three copies of
 * this arithmetic is exactly how they would come to disagree about what
 * somebody paid.
 */
describe("receiptTotals", () => {
  it("reports the stored total, because that is what the order was charged", () => {
    const totals = receiptTotals(makeOrder({ totalAmount: 175.5, appliedDiscount: 25 }));
    expect(totals.displayTotal).toBe(175.5);
  });

  it("recomputes the total from the lines when the order carries none", () => {
    const totals = receiptTotals(
      makeOrder({ totalAmount: 0, appliedDiscount: 50, deliveryFee: 25 }),
    );
    expect(totals.subtotal).toBe(200);
    expect(totals.displayTotal).toBe(175);
  });

  it("never reports a negative total, however large the discount", () => {
    const totals = receiptTotals(makeOrder({ totalAmount: 0, appliedDiscount: 500 }));
    expect(totals.displayTotal).toBe(0);
  });

  it("sums every line rather than trusting the first", () => {
    const totals = receiptTotals(
      makeOrder({
        items: [
          { id: "a", productName: "A", quantity: 1, unitPrice: 10, totalPrice: 10 },
          { id: "b", productName: "B", quantity: 3, unitPrice: 5, totalPrice: 15 },
        ],
      }),
    );
    expect(totals.subtotal).toBe(25);
  });

  it("reports zero for an order with no line detail rather than throwing", () => {
    expect(receiptTotals(makeOrder({ items: [] })).subtotal).toBe(0);
  });
});

describe("receipt formatting", () => {
  it("renders an unparseable order date as blank rather than 'Invalid Date'", () => {
    // The component used to hand `new Date(iso).toLocaleDateString()` straight
    // to the page, so a malformed timestamp printed the literal words
    // "Invalid Date" on a customer's receipt.
    expect(formatReceiptDate("not-a-date")).toBe("");
    expect(formatReceiptDateTime("not-a-date")).toBe("");
  });

  it("renders a real date in the locale the shop trades in", () => {
    expect(formatReceiptDate("2026-08-08T21:26:09.387Z")).toContain("2026");
  });

  it("makes a database status readable", () => {
    expect(statusLabel("pending_payment")).toBe("pending payment");
  });
});
