import { describe, expect, it, vi } from "vitest";
import { calculateEarnedPoints, calculateRedemption, creditLoyaltyPoints } from "./rewards";

describe("Baebe Boo Rewards", () => {
  it("earns one point for each whole Ghana cedi spent", () => {
    expect(calculateEarnedPoints(249.99)).toBe(249);
  });

  it("enforces the 500 point minimum and 20% order cap", () => {
    expect(calculateRedemption({ points: 499, orderSubtotal: 400 })).toEqual({
      pointsUsed: 0,
      credit: 0,
    });
    expect(calculateRedemption({ points: 10_000, orderSubtotal: 400 })).toEqual({
      pointsUsed: 8_000,
      credit: 80,
    });
  });

  it("credits loyalty points through the RPC helper", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    const result = await creditLoyaltyPoints({ rpc }, {
      userId: "user-1",
      eventType: "review",
      sourceKey: "review:user-1:review-1",
      reason: "Verified purchase review",
      orderId: "order-1",
      metadata: { rating: 5 },
    });

    expect(result.error).toBeNull();
    expect(rpc).toHaveBeenCalledWith("credit_loyalty_points", {
      p_user_id: "user-1",
      p_event_type: "review",
      p_source_key: "review:user-1:review-1",
      p_reason: "Verified purchase review",
      p_order_id: "order-1",
      p_metadata: { rating: 5 },
    });
  });
});
