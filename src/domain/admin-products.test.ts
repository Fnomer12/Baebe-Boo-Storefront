import { describe, expect, it } from "vitest";
import {
  carryForwardVariantFields,
  declaredSignature,
  desiredVariantsForCreate,
  filterAdminProducts,
  fromPrice,
  likeFilterTerm,
  parseProductStatusFilter,
  planProductPatch,
  skuConflictMessage,
  skuFromUniqueViolation,
  type AdminProduct,
} from "./admin-products";
import {
  planVariants,
  type DesiredVariant,
  type ExistingVariant,
} from "./catalog/variant-reconcile";
import type { ProductOption } from "./catalog/product-options";

const products: AdminProduct[] = [
  {
    id: "one",
    name: "Organic Cotton Romper",
    description: "A soft newborn essential.",
    category: "Baby Clothing",
    ageRange: "0–3 Months",
    gender: "Unisex",
    price: 120,
    sku: "CL-001",
    imageUrl: "",
    gallery: [],
    active: true,
    featured: false,
    createdAt: "2026-07-23T00:00:00.000Z",
    options: [],
    variants: [],
  },
  {
    id: "two",
    name: "Wooden Activity Cube",
    description: "Playtime favourite.",
    category: "Toys",
    ageRange: "1–2 Years",
    gender: "Unisex",
    price: 240,
    sku: "TY-002",
    imageUrl: "",
    gallery: [],
    active: false,
    featured: false,
    createdAt: "2026-07-22T00:00:00.000Z",
    options: [],
    variants: [],
  },
];

describe("filterAdminProducts", () => {
  it("searches names and SKUs without case sensitivity", () => {
    expect(
      filterAdminProducts(products, {
        query: "cl-001",
        status: "all",
        category: "all",
      }).map((product) => product.id),
    ).toEqual(["one"]);
  });

  it("combines lifecycle and category filters", () => {
    expect(
      filterAdminProducts(products, {
        query: "",
        status: "archived",
        category: "Toys",
      }).map((product) => product.id),
    ).toEqual(["two"]);
  });
});

describe("parseProductStatusFilter", () => {
  it("understands the word on the workspace's own dropdown", () => {
    // The bug: the filter sent `archived` and the route understood only
    // `inactive`, so it fell through to "no filter". Harmless while the browser
    // paged the catalogue itself; once Postgres did the paging, choosing
    // "Archived" returned page one of every product there is.
    expect(parseProductStatusFilter("archived")).toBe("inactive");
    expect(parseProductStatusFilter("active")).toBe("active");
    expect(parseProductStatusFilter("all")).toBeUndefined();
  });

  it("still accepts the older word, so hand-written links keep working", () => {
    expect(parseProductStatusFilter("inactive")).toBe("inactive");
  });

  it("treats anything it does not recognise as no filter at all", () => {
    expect(parseProductStatusFilter(null)).toBeUndefined();
    expect(parseProductStatusFilter("")).toBeUndefined();
    expect(parseProductStatusFilter("deleted")).toBeUndefined();
  });

  it("is not upset by the casing or spacing of a hand-typed parameter", () => {
    expect(parseProductStatusFilter(" Archived ")).toBe("inactive");
  });
});

describe("fromPrice", () => {
  it("takes the cheapest live version, so the card and the page agree", () => {
    expect(
      fromPrice(
        [
          { price: 240, isActive: true },
          { price: 180, isActive: true },
        ],
        999,
      ),
    ).toBe(180);
  });

  it("ignores a discontinued version that still undercuts the live ones", () => {
    // The bug: a GH₵29 clearance variant switched off last season kept the
    // listing advertising "From GH₵29.00" against a GH₵180 product page.
    expect(
      fromPrice(
        [
          { price: 29, isActive: false },
          { price: 180, isActive: true },
        ],
        999,
      ),
    ).toBe(180);
  });

  it("falls back to every version when none is live, rather than showing nothing", () => {
    expect(
      fromPrice(
        [
          { price: 210, isActive: false },
          { price: 180, isActive: false },
        ],
        999,
      ),
    ).toBe(180);
  });

  it("skips a zero price, which is a number that failed to arrive", () => {
    expect(fromPrice([{ price: 0, isActive: true }, { price: 180, isActive: true }], 999)).toBe(
      180,
    );
  });

  it("keeps the current price when there is nothing to compute from", () => {
    expect(fromPrice([], 120)).toBe(120);
  });

  it("reads numeric strings, which is how PostgREST returns numeric columns", () => {
    expect(fromPrice([{ price: "180.00", isActive: true }], 999)).toBe(180);
  });
});

describe("planProductPatch", () => {
  const live = { isVariable: true, hasLiveVariant: true };

  it("refuses a price on a variable product instead of repricing one version", () => {
    // The bug: `patch.price` was written to the product AND to whichever
    // variant happened to be default, silently leaving the rest alone.
    const plan = planProductPatch({ price: 150 }, live);
    expect(plan.rejection).toMatch(/set per version/i);
    expect(plan.product.price).toBeUndefined();
    expect(plan.defaultVariant).toEqual({});
  });

  it("mirrors sku and price onto the only variant of a simple product", () => {
    const plan = planProductPatch(
      { sku: "CL-009", price: 150 },
      { isVariable: false, hasLiveVariant: true },
    );
    expect(plan.rejection).toBeNull();
    expect(plan.product.sku).toBe("CL-009");
    expect(plan.defaultVariant).toEqual({ sku: "CL-009", price: 150 });
  });

  it("leaves variant SKUs alone on a variable product — they are on shelf labels", () => {
    const plan = planProductPatch({ sku: "CL-009" }, live);
    expect(plan.rejection).toBeNull();
    expect(plan.product.sku).toBe("CL-009");
    expect(plan.defaultVariant.sku).toBeUndefined();
  });

  it("leaves the versions alone on a patch that says nothing about the lifecycle", () => {
    expect(planProductPatch({ name: "New name" }, live).variantsActive).toBeNull();
  });
});

describe("archiving and restoring a product", () => {
  /**
   * The whole point of the fix, expressed as the round trip that broke it.
   *
   * A version is "removed" by `is_active = false` — there is no delete, because
   * purchase-order lines are ON DELETE RESTRICT. Archiving used to write that
   * same flag over every row and restoring wrote `true` back, so the round trip
   * put versions the seller had withdrawn back on sale at their old price.
   */
  type Row = { id: string; isActive: boolean };

  function applyPatch(rows: readonly Row[], isActive: boolean): Row[] {
    const plan = planProductPatch(
      { isActive },
      { isVariable: true, hasLiveVariant: rows.some((row) => row.isActive) },
    );
    if (plan.variantsActive === null) return rows.map((row) => ({ ...row }));
    return rows.map((row) => ({ ...row, isActive: plan.variantsActive as boolean }));
  }

  it("does not resurrect a version the seller removed", () => {
    const before: Row[] = [
      { id: "pink", isActive: true },
      { id: "blue-withdrawn", isActive: false },
    ];

    const archived = applyPatch(before, false);
    const restored = applyPatch(archived, true);

    expect(restored).toEqual(before);
  });

  it("switches every version back on for a product archived before this fix", () => {
    // Products already in production were archived by the code that wrote the
    // flag both ways, so every version of them is off. Restoring one has to
    // give it something to sell — with nothing switched on there is no seller
    // decision left to preserve.
    const legacy: Row[] = [
      { id: "pink", isActive: false },
      { id: "blue", isActive: false },
    ];

    expect(applyPatch(legacy, true)).toEqual([
      { id: "pink", isActive: true },
      { id: "blue", isActive: true },
    ]);
  });

  it("never writes the flag on the way out — the product row is the archive", () => {
    expect(planProductPatch({ isActive: false }, { isVariable: true, hasLiveVariant: true })
      .variantsActive).toBeNull();
    expect(planProductPatch({ isActive: false }, { isVariable: false, hasLiveVariant: true })
      .variantsActive).toBeNull();
  });
});

describe("desiredVariantsForCreate", () => {
  it("synthesizes the one row a simple product still needs", () => {
    const [variant, ...rest] = desiredVariantsForCreate({
      options: [],
      variants: [],
      price: 120,
      sku: "CL-001",
      isActive: true,
    });
    expect(rest).toHaveLength(0);
    expect(variant).toMatchObject({
      sku: "CL-001",
      price: 120,
      isDefault: true,
      isActive: true,
      optionValues: {},
    });
  });

  it("passes a supplied grid straight through", () => {
    const variants: DesiredVariant[] = [
      { optionValues: { color: "Pink" }, price: 180 },
      { optionValues: { color: "Blue" }, price: 190 },
    ];
    expect(
      desiredVariantsForCreate({
        options: [{ name: "Colour", values: ["Pink", "Blue"] }],
        variants,
        price: 180,
        sku: "CL-001",
        isActive: true,
      }),
    ).toEqual(variants);
  });
});

describe("carryForwardVariantFields", () => {
  // Named "Color", not "Colour": variants store their values under
  // `optionKey(option.name)`, so the declared name and the jsonb key have to
  // spell the same word or nothing lines up.
  const colour: ProductOption[] = [{ name: "Color", values: ["Pink", "Blue"] }];
  const existing: ExistingVariant[] = [
    {
      id: "variant-pink",
      sku: "CL-001-PINK",
      option_values: { color: "Pink" },
      price: 180,
      costPrice: 90,
      weightGrams: 220,
      compareAtPrice: 220,
      is_active: true,
    },
  ];

  it("keeps a cost price the editor never sends", () => {
    // The bug: the variant grid shows price and stock only — `cost_price` is
    // kept out of the anon column grant and never reaches the browser — so
    // every save wrote null over the cost basis the profit report is built on.
    const [carried] = carryForwardVariantFields(
      [{ id: "variant-pink", optionValues: { color: "Pink" }, price: 185 }],
      existing,
      colour,
    );
    expect(carried.costPrice).toBe(90);
    expect(carried.weightGrams).toBe(220);
    expect(carried.price).toBe(185);
  });

  it("matches by option signature when the row has no id yet", () => {
    const [carried] = carryForwardVariantFields(
      [{ optionValues: { color: "Pink" }, price: 185 }],
      existing,
      colour,
    );
    expect(carried.costPrice).toBe(90);
  });

  it("honours an explicit null, which is how a caller clears a field", () => {
    const [carried] = carryForwardVariantFields(
      [{ id: "variant-pink", optionValues: { color: "Pink" }, price: 185, costPrice: null }],
      existing,
      colour,
    );
    expect(carried.costPrice).toBeNull();
  });

  it("leaves a brand new combination untouched", () => {
    const [carried] = carryForwardVariantFields(
      [{ optionValues: { color: "Blue" }, price: 190 }],
      existing,
      colour,
    );
    expect(carried.costPrice).toBeUndefined();
  });

  it("clears the Was price the seller emptied instead of quietly putting it back", () => {
    // The bug: `compareAtPrice` was carried forward like the invisible fields,
    // but it IS on the grid. Emptying the "Was" box did nothing at all — and
    // emptying it while raising the price left 220 sitting against a 240 price,
    // which the `compare_at_price >= price` CHECK answers with a 409 naming
    // nothing the seller can see.
    const cleared: DesiredVariant[] = [
      { id: "variant-pink", optionValues: { color: "Pink" }, price: 240 },
    ];
    const desired = carryForwardVariantFields(cleared, existing, colour);
    expect(desired[0].compareAtPrice).toBeUndefined();

    const plan = planVariants(existing, desired, colour, { skuBase: "CL-001" });
    expect(plan.problems).toEqual([]);
    expect(plan.updates[0]?.changes.compareAtPrice).toBeNull();
  });

  it("carries the cost basis onto the row the reconciler is going to update", () => {
    // The bug: this matched on the UNRESTRICTED signature while `planVariants`
    // matches on the declared-only one. Turning a variable product back into a
    // simple one — the seller deletes the Colour option — leaves one row whose
    // declared signature is empty, so the reconciler matched it to the Pink
    // variant while nothing was found here, and the save wrote null over the
    // cost price and weight of the version that survived.
    const twoColours: ExistingVariant[] = [
      // The withdrawn row comes FIRST, because "whichever appeared first in the
      // array" is exactly the disagreement being fixed: `planVariants` prefers
      // the live row, then the default.
      {
        id: "variant-blue",
        sku: "CL-001-BLUE",
        option_values: { color: "Blue" },
        price: 190,
        costPrice: 95,
        weightGrams: 230,
        is_active: false,
      },
      {
        id: "variant-pink",
        sku: "CL-001-PINK",
        option_values: { color: "Pink" },
        price: 180,
        costPrice: 90,
        weightGrams: 220,
        is_active: true,
        is_default: true,
      },
    ];

    const desired = carryForwardVariantFields([{ optionValues: {}, price: 180 }], twoColours, []);
    expect(desired[0].costPrice).toBe(90);
    expect(desired[0].weightGrams).toBe(220);

    // And the reconciler agrees: the surviving row keeps the numbers rather
    // than being handed a null for each of them.
    const plan = planVariants(twoColours, desired, [], { skuBase: "CL-001" });
    const survivor = [...plan.updates, ...plan.reactivates].find(
      (update) => update.id === "variant-pink",
    );
    expect(survivor?.changes.costPrice).toBeUndefined();
    expect(survivor?.changes.weightGrams).toBeUndefined();
  });
});

describe("declaredSignature", () => {
  it("ignores a stored key the product no longer offers", () => {
    const options: ProductOption[] = [{ name: "Size", values: ["3M"] }];
    expect(declaredSignature({ size: "3M", gender: "Girls" }, options)).toBe(
      declaredSignature({ size: "3M" }, options),
    );
  });

  it("collapses to one version once a product declares no options", () => {
    expect(declaredSignature({ color: "Pink" }, [])).toBe(declaredSignature({}, []));
  });
});

describe("likeFilterTerm", () => {
  it("survives the comma that used to 400 the whole product list", () => {
    // PostgREST splits `or=(…)` on commas, so "Romper, Pink" produced a 400
    // rather than a result set once the filter moved into Postgres.
    expect(likeFilterTerm("Romper, Pink")).toBe("Romper, Pink");
  });

  it("escapes the quote that would otherwise end the quoted pattern early", () => {
    expect(likeFilterTerm('Baby "Boo"')).toBe('Baby \\"Boo\\"');
    expect(likeFilterTerm("back\\slash")).toBe("back\\\\slash");
  });

  it("trims, so a stray space does not become part of the pattern", () => {
    expect(likeFilterTerm("  romper  ")).toBe("romper");
    expect(likeFilterTerm("   ")).toBe("");
  });
});

describe("skuConflictMessage", () => {
  it("names the offending code so the owner knows which cell to change", () => {
    expect(skuConflictMessage(["CL-001-PINK"])).toContain("CL-001-PINK");
  });

  it("lists every clashing code once, in a stable order", () => {
    expect(skuConflictMessage(["B-2", "A-1", "B-2"])).toContain("A-1, B-2");
  });

  it("still says something useful when Postgres named nothing", () => {
    expect(skuConflictMessage([])).toMatch(/already used/i);
  });
});

describe("skuFromUniqueViolation", () => {
  it("pulls the SKU out of the driver's details, for the two-admins race", () => {
    expect(
      skuFromUniqueViolation({
        details: "Key (sku)=(CL-001-PINK) already exists.",
        message: "duplicate key value violates unique constraint",
      }),
    ).toBe("CL-001-PINK");
  });

  it("returns null when the violation was about something else", () => {
    expect(
      skuFromUniqueViolation({
        details: "Key (product_id, shop_id)=(1, 2) already exists.",
      }),
    ).toBeNull();
    expect(skuFromUniqueViolation({})).toBeNull();
  });
});
