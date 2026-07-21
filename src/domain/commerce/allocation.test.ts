import { describe, expect, it } from "vitest";
import { allocateInventory } from "./allocation";

describe("allocateInventory", () => {
  it("prefers the single branch that can fulfil the whole cart", () => {
    const result = allocateInventory(
      [
        { variantId: "vest-blue-0-3", quantity: 2 },
        { variantId: "bottle-250ml", quantity: 1 },
      ],
      [
        {
          branchId: "accra",
          stock: { "vest-blue-0-3": 2, "bottle-250ml": 1 },
        },
        {
          branchId: "kumasi",
          stock: { "vest-blue-0-3": 5, "bottle-250ml": 0 },
        },
      ],
    );

    expect(result).toEqual({
      status: "allocated",
      split: false,
      allocations: [
        {
          branchId: "accra",
          items: [
            { variantId: "vest-blue-0-3", quantity: 2 },
            { variantId: "bottle-250ml", quantity: 1 },
          ],
        },
      ],
    });
  });

  it("returns the smallest viable split when one branch is insufficient", () => {
    const result = allocateInventory(
      [
        { variantId: "vest-blue-0-3", quantity: 3 },
        { variantId: "bottle-250ml", quantity: 1 },
      ],
      [
        {
          branchId: "accra",
          stock: { "vest-blue-0-3": 2, "bottle-250ml": 1 },
        },
        {
          branchId: "kumasi",
          stock: { "vest-blue-0-3": 1, "bottle-250ml": 0 },
        },
      ],
    );

    expect(result.status).toBe("allocated");
    expect(result.split).toBe(true);
    expect(result.allocations).toHaveLength(2);
  });

  it("reports the exact shortages rather than overselling", () => {
    const result = allocateInventory(
      [{ variantId: "crib-natural", quantity: 2 }],
      [
        { branchId: "accra", stock: { "crib-natural": 1 } },
        { branchId: "kumasi", stock: { "crib-natural": 0 } },
      ],
    );

    expect(result).toEqual({
      status: "insufficient_stock",
      split: false,
      allocations: [],
      shortages: [{ variantId: "crib-natural", requested: 2, available: 1 }],
    });
  });
});
