import { describe, expect, it } from "vitest";
import {
  deliveryZoneCreateSchema,
  deliveryZonePatchSchema,
} from "./delivery-schemas";

const valid = {
  name: "Accra Central",
  regions: ["Greater Accra"],
  baseFee: 25,
  freeDeliveryThreshold: 500,
  estimatedDaysMin: 1,
  estimatedDaysMax: 2,
  isActive: true,
};

describe("deliveryZoneCreateSchema", () => {
  it("accepts a complete zone", () => {
    const result = deliveryZoneCreateSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it("defaults regions and isActive so a minimal zone still works", () => {
    const result = deliveryZoneCreateSchema.safeParse({ name: "Flat rate", baseFee: 30 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.regions).toEqual([]);
      expect(result.data.isActive).toBe(true);
    }
  });

  it("allows a free zone", () => {
    expect(deliveryZoneCreateSchema.safeParse({ ...valid, baseFee: 0 }).success).toBe(true);
  });

  it("rejects a negative fee", () => {
    expect(deliveryZoneCreateSchema.safeParse({ ...valid, baseFee: -1 }).success).toBe(false);
  });

  it("requires a name", () => {
    expect(deliveryZoneCreateSchema.safeParse({ ...valid, name: "   " }).success).toBe(false);
  });

  it("rejects a slowest day earlier than the fastest, matching the table CHECK", () => {
    const result = deliveryZoneCreateSchema.safeParse({
      ...valid,
      estimatedDaysMin: 5,
      estimatedDaysMax: 2,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toMatch(/cannot be before/i);
      expect(result.error.issues[0].path).toContain("estimatedDaysMax");
    }
  });

  it("allows equal fastest and slowest days", () => {
    expect(
      deliveryZoneCreateSchema.safeParse({
        ...valid,
        estimatedDaysMin: 2,
        estimatedDaysMax: 2,
      }).success,
    ).toBe(true);
  });

  it("treats a blank threshold as no threshold rather than zero", () => {
    // Free-over-GH₵0 would make every order free delivery, so "" must not
    // collapse to 0.
    const result = deliveryZoneCreateSchema.safeParse({
      ...valid,
      freeDeliveryThreshold: "",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.freeDeliveryThreshold).toBeNull();
  });

  it("treats a blank day estimate as unknown", () => {
    const result = deliveryZoneCreateSchema.safeParse({
      ...valid,
      estimatedDaysMin: "",
      estimatedDaysMax: "",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.estimatedDaysMin).toBeNull();
      expect(result.data.estimatedDaysMax).toBeNull();
    }
  });

  it("rejects a fractional day estimate", () => {
    expect(
      deliveryZoneCreateSchema.safeParse({ ...valid, estimatedDaysMin: 1.5 }).success,
    ).toBe(false);
  });
});

describe("deliveryZonePatchSchema", () => {
  it("accepts a single field", () => {
    expect(deliveryZonePatchSchema.safeParse({ baseFee: 45 }).success).toBe(true);
  });

  it("accepts an activation toggle on its own", () => {
    expect(deliveryZonePatchSchema.safeParse({ isActive: false }).success).toBe(true);
  });

  it("rejects an empty patch", () => {
    expect(deliveryZonePatchSchema.safeParse({}).success).toBe(false);
  });

  it("still enforces day ordering when both are supplied", () => {
    expect(
      deliveryZonePatchSchema.safeParse({ estimatedDaysMin: 9, estimatedDaysMax: 1 }).success,
    ).toBe(false);
  });

  it("does not fire the ordering rule when only one day is patched", () => {
    expect(deliveryZonePatchSchema.safeParse({ estimatedDaysMax: 1 }).success).toBe(true);
  });

  it("distinguishes clearing a value from leaving it alone", () => {
    // null clears the threshold; omitting it must leave the stored one intact.
    // Without this distinction a threshold could be set but never removed.
    const cleared = deliveryZonePatchSchema.safeParse({ freeDeliveryThreshold: null });
    expect(cleared.success).toBe(true);
    if (cleared.success) expect(cleared.data.freeDeliveryThreshold).toBeNull();

    const untouched = deliveryZonePatchSchema.safeParse({ baseFee: 30 });
    expect(untouched.success).toBe(true);
    if (untouched.success) {
      expect(untouched.data.freeDeliveryThreshold).toBeUndefined();
    }
  });

  it("allows clearing a day estimate without tripping the ordering rule", () => {
    expect(
      deliveryZonePatchSchema.safeParse({ estimatedDaysMin: 5, estimatedDaysMax: null })
        .success,
    ).toBe(true);
  });
});
