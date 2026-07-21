import { describe, expect, it } from "vitest";
import { calculateEarnedPoints, calculateRedemption } from "./rewards";

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
});
