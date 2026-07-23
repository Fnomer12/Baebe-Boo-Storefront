import { describe, expect, it } from "vitest";
import {
  inventoryAdjustmentSchema,
  productCreateSchema,
  productPatchSchema,
} from "./catalog-schemas";

describe("admin catalog request schemas", () => {
  it("accepts a complete product and rejects duplicate shop allocations", () => {
    const shopId = "8b9ad8fd-f1e5-4bd4-89ef-a4d702838658";
    const product = {
      name: "Organic Cotton Romper",
      description: "Soft everyday layer",
      category: "Clothing",
      ageRange: "0-3 months",
      gender: "Unisex",
      price: 129.5,
      availability: [{ shopId, onHand: 12 }],
    };

    expect(productCreateSchema.safeParse(product).success).toBe(true);
    expect(
      productCreateSchema.safeParse({
        ...product,
        availability: [
          { shopId, onHand: 12 },
          { shopId, onHand: 4 },
        ],
      }).success,
    ).toBe(false);
  });

  it("requires product patches to contain a change", () => {
    expect(productPatchSchema.safeParse({}).success).toBe(false);
    expect(productPatchSchema.safeParse({ isActive: false }).success).toBe(true);
  });

  it("accepts integer inventory counts and rejects negative stock", () => {
    expect(
      inventoryAdjustmentSchema.safeParse({
        onHand: 20,
        reorderPoint: 4,
      }).success,
    ).toBe(true);
    expect(
      inventoryAdjustmentSchema.safeParse({
        onHand: -1,
      }).success,
    ).toBe(false);
  });
});
