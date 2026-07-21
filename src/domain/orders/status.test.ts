import { describe, expect, it } from "vitest";
import { transitionOrder } from "./status";

describe("transitionOrder", () => {
  it("maps fulfilment transitions to customer-visible shipping state and timestamps", () => {
    const now = new Date("2026-07-21T12:00:00.000Z");
    expect(transitionOrder({ orderStatus: "processing", shippingStatus: "pending" }, "dispatched", now)).toEqual({
      orderStatus: "dispatched",
      shippingStatus: "shipped",
      shippedAt: now.toISOString(),
    });
  });

  it("rejects an impossible transition from unpaid to delivered", () => {
    expect(() =>
      transitionOrder({ orderStatus: "pending_payment", shippingStatus: "pending" }, "delivered", new Date()),
    ).toThrow("Cannot transition order from pending_payment to delivered");
  });

  it("makes completed orders terminal", () => {
    expect(() =>
      transitionOrder({ orderStatus: "completed", shippingStatus: "delivered" }, "processing", new Date()),
    ).toThrow("Cannot transition order from completed to processing");
  });
});
