import { describe, expect, it } from "vitest";
import { planVariants, type DesiredVariant, type ExistingVariant } from "./variant-reconcile";

const options = [
  { name: "Colour", values: ["Pink", "Blue"] },
  { name: "Size", values: ["3M", "6M"] },
];

function existing(overrides: Partial<ExistingVariant> = {}): ExistingVariant {
  return {
    id: "row-pink-3m",
    sku: "BB-1-PINK-3M",
    title: "Pink / 3M",
    option_values: { colour: "Pink", size: "3M" },
    price: 120,
    is_active: true,
    isDefault: true,
    ...overrides,
  };
}

function desired(overrides: Partial<DesiredVariant> = {}): DesiredVariant {
  return {
    optionValues: { colour: "Pink", size: "3M" },
    price: 120,
    isDefault: true,
    isActive: true,
    ...overrides,
  };
}

describe("planVariants", () => {
  it("never emits a delete, because a variant on a purchase order cannot be deleted", () => {
    const plan = planVariants([existing()], [], options);
    expect(plan.deactivates).toHaveLength(1);
    expect(plan.deactivates[0]).toMatchObject({
      id: "row-pink-3m",
      changes: { isActive: false, isDefault: false },
    });
    expect(Object.keys(plan)).not.toContain("deletes");
  });

  it("REACTIVATES a re-added combination instead of colliding on its globally unique SKU", () => {
    // The seller removed Blue/6M last month and has just re-added it. The old
    // row still holds BB-1-BLUE-6M, its stock and its purchase history.
    const rows = [
      existing(),
      existing({
        id: "row-blue-6m",
        sku: "BB-1-BLUE-6M",
        title: "Blue / 6M",
        option_values: { colour: "Blue", size: "6M" },
        is_active: false,
        isDefault: false,
      }),
    ];

    const plan = planVariants(
      rows,
      [desired(), desired({ optionValues: { colour: "Blue", size: "6M" }, isDefault: false })],
      options,
      { skuBase: "BB-1" },
    );

    expect(plan.creates).toEqual([]);
    expect(plan.reactivates).toHaveLength(1);
    expect(plan.reactivates[0]).toMatchObject({
      id: "row-blue-6m",
      sku: "BB-1-BLUE-6M",
      changes: { isActive: true },
    });
    // The SKU is not rewritten: it is printed on labels and referenced by
    // purchase orders.
    expect(plan.reactivates[0].changes.sku).toBeUndefined();
  });

  it("reactivates through the differences a seller cannot see when retyping", () => {
    const rows = [
      existing({
        id: "row-old",
        option_values: { colour: "Pink", size: "3–6 Months" },
        is_active: false,
        isDefault: false,
      }),
    ];
    const sizes = [
      { name: "Colour", values: ["Pink"] },
      { name: "Size", values: ["3-6  months"] },
    ];

    const plan = planVariants(rows, [desired({ optionValues: { COLOUR: "pink", Size: "3-6  months" } })], sizes);

    expect(plan.creates).toEqual([]);
    expect(plan.reactivates.map((row) => row.id)).toEqual(["row-old"]);
  });

  it("matches by explicit id before signature, so a retitled row is not duplicated", () => {
    const rows = [existing({ id: "row-a", option_values: { colour: "Pink", size: "3M" } })];
    const plan = planVariants(
      rows,
      [desired({ id: "row-a", optionValues: { colour: "Blue", size: "6M" } })],
      options,
    );

    expect(plan.creates).toEqual([]);
    expect(plan.updates[0]).toMatchObject({
      id: "row-a",
      changes: { title: "Blue / 6M", optionValues: { colour: "Blue", size: "6M" } },
    });
  });

  it("refuses an id that is not on this product rather than silently creating a row", () => {
    const plan = planVariants([existing()], [desired({ id: "row-from-another-product" })], options);
    expect(plan.problems.map((problem) => problem.code)).toContain("unknown-variant");
    expect(plan.creates).toEqual([]);
  });

  it("promotes a survivor when the default was removed", () => {
    const rows = [
      existing(),
      existing({
        id: "row-blue-3m",
        sku: "BB-1-BLUE-3M",
        option_values: { colour: "Blue", size: "3M" },
        isDefault: false,
      }),
    ];

    const plan = planVariants(
      rows,
      [desired({ optionValues: { colour: "Blue", size: "3M" }, isDefault: false })],
      options,
    );

    expect(plan.defaultId).toBe("row-blue-3m");
    expect(plan.updates[0].changes.isDefault).toBe(true);
    // And the outgoing default gives up the flag, or the partial unique index
    // `product_variants_one_default` rejects the promotion.
    expect(plan.deactivates[0]).toMatchObject({ id: "row-pink-3m", changes: { isDefault: false } });
  });

  it("keeps exactly one default when the seller ticks two", () => {
    const plan = planVariants(
      [],
      [desired(), desired({ optionValues: { colour: "Blue", size: "6M" }, isDefault: true })],
      options,
      { skuBase: "BB-1" },
    );

    expect(plan.problems.map((problem) => problem.code)).toContain("multiple-defaults");
    expect(plan.creates.filter((row) => row.isDefault)).toHaveLength(1);
    expect(plan.creates[0].isDefault).toBe(true);
  });

  it("points the default at a new row by signature, since it has no id yet", () => {
    const plan = planVariants([], [desired()], options, { skuBase: "BB-1" });
    expect(plan.defaultId).toBeNull();
    expect(plan.defaultSignature).toBe(plan.creates[0].signature);
  });

  it("names and numbers new variants without being told", () => {
    const plan = planVariants([], [desired({ optionValues: { colour: "Blue", size: "6M" } })], options, {
      skuBase: "BB-1",
    });
    expect(plan.creates[0]).toMatchObject({ title: "Blue / 6M", sku: "BB-1-BLUE-6M" });
  });

  it("does not reuse a SKU that another product already holds", () => {
    const plan = planVariants([], [desired()], options, {
      skuBase: "BB-1",
      takenSkus: ["BB-1-PINK-3M"],
    });
    expect(plan.creates[0].sku).toBe("BB-1-PINK-3M-2");
  });

  it("rejects a combination the product does not offer", () => {
    const plan = planVariants([], [desired({ optionValues: { colour: "Green", size: "3M" } })], options);
    expect(plan.problems[0]).toMatchObject({
      code: "unknown-option-value",
      variantIndex: 0,
      path: ["variants", 0, "optionValues", "colour"],
    });
    expect(plan.creates).toEqual([]);
  });

  it("rejects a variant that leaves an option unanswered", () => {
    const plan = planVariants([], [desired({ optionValues: { colour: "Pink" } })], options);
    expect(plan.problems[0]).toMatchObject({
      code: "missing-option-value",
      path: ["variants", 0, "optionValues", "size"],
    });
  });

  it("rejects two rows describing the same combination", () => {
    const plan = planVariants([], [desired(), desired({ optionValues: { Colour: " pink ", size: "3M" } })], options);
    expect(plan.problems.map((problem) => problem.code)).toContain("duplicate-variant");
    expect(plan.creates).toHaveLength(1);
  });

  it("reports the cap rather than writing 200 rows", () => {
    const many = Array.from({ length: 101 }, (_, index) =>
      desired({ optionValues: { colour: "Pink", size: `${index}M` }, isDefault: index === 0 }),
    );
    const plan = planVariants([], many, [
      { name: "Colour", values: ["Pink"] },
      { name: "Size", values: many.map((_, index) => `${index}M`) },
    ]);
    expect(plan.problems.map((problem) => problem.code)).toContain("too-many-variants");
  });

  it("collapses a legacy duplicate onto one row instead of leaving two live", () => {
    const twin = existing({ id: "row-twin", sku: "BB-1-PINK-3M-DUP", isDefault: false });
    const plan = planVariants([existing(), twin], [desired()], options);

    expect(plan.updates.concat(plan.reactivates)).toHaveLength(0);
    expect(plan.deactivates.map((row) => row.id)).toEqual(["row-twin"]);
  });

  it("keeps the live row when a legacy duplicate is the one still switched on", () => {
    const plan = planVariants(
      [
        existing({ id: "row-dead", is_active: false, isDefault: false }),
        existing({ id: "row-live", sku: "BB-1-PINK-3M-B" }),
      ],
      [desired()],
      options,
    );

    expect(plan.deactivates.map((row) => row.id)).toEqual([]);
    expect(plan.defaultId).toBe("row-live");
  });

  it("switches off the legacy Default Title row when a simple product gains options", () => {
    const legacy = existing({ id: "row-legacy", option_values: {}, title: "Default Title" });
    const plan = planVariants(legacy ? [legacy] : [], [desired()], options, { skuBase: "BB-1" });

    expect(plan.creates).toHaveLength(1);
    expect(plan.deactivates.map((row) => row.id)).toEqual(["row-legacy"]);
  });

  it("keeps the default row when a variable product is flattened back to simple", () => {
    const rows = [
      existing(),
      existing({ id: "row-blue", sku: "BB-1-BLUE-6M", option_values: { colour: "Blue", size: "6M" }, isDefault: false }),
    ];
    const plan = planVariants(rows, [desired({ optionValues: {} })], []);

    expect(plan.creates).toEqual([]);
    expect(plan.deactivates.map((row) => row.id)).toEqual(["row-blue"]);
    expect(plan.defaultId).toBe("row-pink-3m");
    // The survivor keeps its stock and its history, but stops advertising
    // options the product no longer has.
    expect(plan.updates[0]).toMatchObject({
      id: "row-pink-3m",
      changes: { title: "Default Title", optionValues: {} },
    });
  });

  it("emits nothing for a row nobody touched, so saves do not churn updated_at", () => {
    const plan = planVariants([existing()], [desired()], options);
    expect(plan).toMatchObject({ creates: [], updates: [], reactivates: [], deactivates: [] });
    expect(plan.defaultId).toBe("row-pink-3m");
  });

  it("carries price changes but leaves untouched fields alone", () => {
    const plan = planVariants([existing()], [desired({ price: 149.5, compareAtPrice: 180 })], options);
    expect(plan.updates[0].changes).toEqual({ price: 149.5, compareAtPrice: 180 });
  });

  it("reads a raw product_variants row, not just an admin mapper's camelCase one", () => {
    const raw = {
      id: "row-raw",
      sku: "BB-1-PINK-3M",
      title: "Pink / 3M",
      option_values: { colour: "Pink", size: "3M" },
      price: "120.00",
      is_active: true,
      is_default: true,
    };

    const plan = planVariants([raw], [desired()], options);
    expect(plan).toMatchObject({ creates: [], updates: [], deactivates: [] });
    expect(plan.defaultId).toBe("row-raw");
  });

  it("warns when the seller switches every version off", () => {
    const plan = planVariants([existing()], [desired({ isActive: false })], options);
    expect(plan.problems.map((problem) => problem.code)).toContain("no-active-variant");
    expect(plan.defaultId).toBeNull();
  });
});
