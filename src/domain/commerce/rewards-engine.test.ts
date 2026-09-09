import { describe, expect, it } from "vitest";
import {
  calculateEarnedPoints,
  calculateRedemption,
  parsePurchaseEarnConfig,
  tierForLifetimePoints,
} from "./rewards";

describe("loyalty engine", () => {
  it("parses the purchase earn config with safe fallbacks", () => {
    expect(parsePurchaseEarnConfig(null)).toMatchObject({
      pointsPerCedi: 1,
      minimumOrderAmount: 0,
    });
    expect(
      parsePurchaseEarnConfig({ points_per_cedi: 2.5, minimum_order_amount: 50, expiry_days: 90 }),
    ).toMatchObject({ pointsPerCedi: 2.5, minimumOrderAmount: 50, expiryDays: 90 });
    expect(parsePurchaseEarnConfig({ points_per_cedi: -3 }).pointsPerCedi).toBe(1);
  });

  it("applies rate and tier multiplier to purchase earn", () => {
    expect(calculateEarnedPoints(100, {})).toBe(100);
    expect(calculateEarnedPoints(100, { pointsPerCedi: 2 })).toBe(200);
    expect(calculateEarnedPoints(100, { pointsPerCedi: 2, multiplier: 1.5 })).toBe(300);
  });

  it("picks the highest qualifying tier", () => {
    const tiers = [
      { id: "b", name: "Bronze", minLifetimePoints: 0, earnMultiplier: 1, isActive: true },
      { id: "s", name: "Silver", minLifetimePoints: 5000, earnMultiplier: 1.25, isActive: true },
      { id: "g", name: "Gold", minLifetimePoints: 20000, earnMultiplier: 1.5, isActive: true },
    ];
    expect(tierForLifetimePoints(tiers, 6000)?.name).toBe("Silver");
    expect(tierForLifetimePoints(tiers, 100)?.name).toBe("Bronze");
    expect(tierForLifetimePoints(tiers, 0)?.name).toBe("Bronze");
  });

  it("honours a custom redemption policy", () => {
    expect(
      calculateRedemption({
        points: 10_000,
        orderSubtotal: 400,
        policy: { pointsPerCedi: 50, minimumRedemptionPoints: 100, maximumOrderShare: 0.5 },
      }),
    ).toEqual({ pointsUsed: 10_000, credit: 200 });
  });
});
