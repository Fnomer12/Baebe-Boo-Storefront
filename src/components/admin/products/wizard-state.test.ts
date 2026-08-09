import { describe, expect, it } from "vitest";
import type { ProductOption } from "@/domain/catalog/product-options";
import type { AdminProductVariant } from "@/domain/admin-products";
import {
  applyBulkAction,
  bulkScopeLabel,
  bulkTargets,
  conflictingSkuKeys,
  draftsFromVariants,
  invalidPriceKeys,
  removalWarningText,
  removalWarnings,
  resolveDefaultKey,
  syncVariantDrafts,
  variantCountSentence,
  variantCountSummary,
  variantPayload,
  type VariantDraft,
} from "./wizard-state";

const osu = "aaaaaaaa-aaaa-4aaa-8aaa-000000000001";
const spintex = "aaaaaaaa-aaaa-4aaa-8aaa-000000000002";

const colourSize: ProductOption[] = [
  { name: "Colour", values: ["Pink", "Blue"] },
  { name: "Size", values: ["3M", "6M", "9M"] },
];

function context(overrides: Partial<Parameters<typeof syncVariantDrafts>[2]> = {}) {
  return {
    skuBase: "CL-26123ABC",
    price: "40",
    shopIds: [osu],
    stockSeed: "5",
    ...overrides,
  };
}

function build(options: ProductOption[] = colourSize, overrides = {}) {
  return syncVariantDrafts(options, [], context(overrides));
}

describe("variantCountSummary", () => {
  it("multiplies the choices and names them in the seller's own words", () => {
    const summary = variantCountSummary(colourSize);

    expect(summary.count).toBe(6);
    expect(summary.parts).toEqual(["2 colours", "3 sizes"]);
    expect(variantCountSentence(summary)).toBe(
      "This will create 6 versions (2 colours × 3 sizes).",
    );
  });

  it("drops the breakdown when there is only one choice to break down", () => {
    expect(variantCountSentence(variantCountSummary([{ name: "Size", values: ["3M", "6M"] }]))).toBe(
      "This will create 2 versions.",
    );
  });

  it("turns amber past fifty and is refused past a hundred", () => {
    const fifty = variantCountSummary([{ name: "Size", values: Array.from({ length: 50 }, (_, i) => `S${i}`) }]);
    const sixty = variantCountSummary([
      { name: "Size", values: Array.from({ length: 30 }, (_, i) => `S${i}`) },
      { name: "Colour", values: ["Pink", "Blue"] },
    ]);
    const hundredAndTwo = variantCountSummary([
      { name: "Size", values: Array.from({ length: 51 }, (_, i) => `S${i}`) },
      { name: "Colour", values: ["Pink", "Blue"] },
    ]);

    expect(fifty.level).toBe("ok");
    expect(sixty.level).toBe("crowded");
    expect(hundredAndTwo.level).toBe("refused");
  });
});

describe("syncVariantDrafts", () => {
  it("gives every combination a unique code, first option varying slowest", () => {
    const rows = build();

    expect(rows).toHaveLength(6);
    expect(rows.map((row) => row.title)).toEqual([
      "Pink / 3M",
      "Pink / 6M",
      "Pink / 9M",
      "Blue / 3M",
      "Blue / 6M",
      "Blue / 9M",
    ]);
    expect(new Set(rows.map((row) => row.sku)).size).toBe(6);
  });

  it("adding a value regenerates ONLY the new combinations", () => {
    // THE BUG: rebuilding the grid from scratch on every option change handed
    // back blank rows with no ids, so the save inserted duplicates and orphaned
    // the variants carrying the stock and the purchase history.
    const priced = build().map((row, index) =>
      index === 0 ? { ...row, id: "variant-1", price: "99", saved: true, stock: { [osu]: "12" } } : row,
    );

    const grown = syncVariantDrafts(
      [{ name: "Colour", values: ["Pink", "Blue", "Green"] }, colourSize[1]],
      priced,
      context(),
    );

    expect(grown).toHaveLength(9);
    const pink3m = grown.find((row) => row.title === "Pink / 3M");
    expect(pink3m).toMatchObject({ id: "variant-1", price: "99", stock: { [osu]: "12" } });
    expect(grown.filter((row) => row.title.startsWith("Green")).every((row) => !row.saved)).toBe(true);
  });

  it("keeps every priced row when the seller only corrects an option's spelling", () => {
    // THE BUG: identity is the option signature, and the signature contains the
    // option NAME — so renaming "Colour" to "Color" blanked all six rows, one
    // keystroke at a time, while the seller was still typing.
    const priced = build().map((row) => ({ ...row, price: "77", saved: true, id: `id-${row.key}` }));

    const renamed = syncVariantDrafts(
      [{ name: "Color", values: ["Pink", "Blue"] }, colourSize[1]],
      priced,
      context(),
    );

    expect(renamed).toHaveLength(6);
    expect(renamed.every((row) => row.price === "77")).toBe(true);
    expect(renamed.every((row) => row.saved)).toBe(true);
    expect(renamed[0].optionValues).toEqual({ color: "Pink", size: "3M" });
  });

  it("seeds a newly ticked shop without touching the counts already typed", () => {
    const typed = build().map((row) => ({ ...row, stock: { [osu]: "12" } }));

    const widened = syncVariantDrafts(colourSize, typed, context({ shopIds: [osu, spintex] }));

    expect(widened[0].stock).toEqual({ [osu]: "12", [spintex]: "5" });
  });

  it("keeps the counts for a shop that was un-ticked, so re-ticking restores them", () => {
    const typed = build().map((row) => ({ ...row, stock: { [osu]: "12", [spintex]: "4" } }));

    const narrowed = syncVariantDrafts(colourSize, typed, context({ shopIds: [osu] }));

    expect(narrowed[0].stock[spintex]).toBe("4");
  });

  it("treats a product with no options as one version, not none", () => {
    const rows = syncVariantDrafts([], [], context());

    expect(rows).toHaveLength(1);
    expect(rows[0].optionValues).toEqual({});
  });
});

describe("applyBulkAction", () => {
  it("sets one price across every row when nothing is ticked", () => {
    const rows = build();

    const priced = applyBulkAction(rows, new Set<string>(), { kind: "price", value: "25" }, {
      skuBase: "CL-1",
      options: colourSize,
      shopIds: [osu],
    });

    expect(priced.every((row) => row.price === "25")).toBe(true);
  });

  it("touches only the ticked rows when some are ticked", () => {
    const rows = build();
    const ticked = new Set(rows.slice(0, 3).map((row) => row.key));

    const priced = applyBulkAction(rows, ticked, { kind: "price", value: "25" }, {
      skuBase: "CL-1",
      options: colourSize,
      shopIds: [osu],
    });

    expect(priced.slice(0, 3).map((row) => row.price)).toEqual(["25", "25", "25"]);
    expect(priced.slice(3).map((row) => row.price)).toEqual(["40", "40", "40"]);
  });

  it("sets stock for one named shop rather than all of them", () => {
    const rows = syncVariantDrafts(colourSize, [], context({ shopIds: [osu, spintex] }));

    const stocked = applyBulkAction(rows, new Set<string>(), { kind: "stock", value: "8", shopId: spintex }, {
      skuBase: "CL-1",
      options: colourSize,
      shopIds: [osu, spintex],
    });

    expect(stocked[0].stock).toEqual({ [osu]: "5", [spintex]: "8" });
  });

  it("regenerates codes without colliding with the rows it was told to leave alone", () => {
    const rows = build().map((row, index) => (index === 0 ? { ...row, sku: "CL-26123ABC-BLUE-3M" } : row));
    const ticked = new Set([rows[0].key]);

    const regenerated = applyBulkAction(rows, ticked, { kind: "sku" }, {
      skuBase: "CL-26123ABC",
      options: colourSize,
      shopIds: [osu],
    });

    expect(new Set(regenerated.map((row) => row.sku)).size).toBe(6);
  });

  it("only greys a removed row, so it can be put back before saving", () => {
    const rows = build();

    const removed = applyBulkAction(rows, new Set([rows[1].key]), { kind: "remove" }, {
      skuBase: "CL-1",
      options: colourSize,
      shopIds: [osu],
    });

    expect(removed[1].removed).toBe(true);
    expect(removed.filter((row) => row.removed)).toHaveLength(1);
  });

  it("leaves the rows the seller struck out alone, and says so", () => {
    // THE BUG: "all" meant every row in the grid, removed ones included. The
    // bar announced "all 6 versions" over a grid showing four live ones, and
    // the two struck out took the new price as well — which they then carry if
    // the seller undoes the removal before saving.
    const rows = build().map((row, index) => (index < 2 ? { ...row, removed: true } : row));

    expect(bulkScopeLabel(rows, new Set<string>())).toBe("all 4 versions");
    expect(bulkTargets(rows, new Set<string>()).map((row) => row.key)).toEqual(
      rows.slice(2).map((row) => row.key),
    );

    const priced = applyBulkAction(rows, new Set<string>(), { kind: "price", value: "25" }, {
      skuBase: "CL-1",
      options: colourSize,
      shopIds: [osu],
    });

    expect(priced.slice(0, 2).map((row) => row.price)).toEqual(["40", "40"]);
    expect(priced.slice(2).every((row) => row.price === "25")).toBe(true);
  });

  it("counts a tick on a struck-out row out of the scope rather than out of the tally", () => {
    // Ticking only removed rows must not fall through to "everything": the
    // seller made a choice, and the honest answer to it is "nothing".
    const rows = build().map((row, index) => (index === 0 ? { ...row, removed: true } : row));
    const ticked = new Set([rows[0].key, rows[1].key]);

    expect(bulkScopeLabel(rows, ticked)).toBe("1 version selected");
    expect(bulkTargets(rows, ticked).map((row) => row.key)).toEqual([rows[1].key]);
    expect(bulkTargets(rows, new Set([rows[0].key]))).toHaveLength(0);
  });
});

describe("removalWarnings", () => {
  it("names the version losing its value and says what stock it holds", () => {
    const baseline = build().map((row) => ({ ...row, saved: true, id: `id-${row.key}`, onHand: 12 }));
    const shrunk = syncVariantDrafts([colourSize[0], { name: "Size", values: ["3M", "6M"] }], baseline, context());

    const warnings = removalWarnings(baseline, shrunk);

    expect(warnings.map((warning) => warning.title)).toEqual(["Pink / 9M", "Blue / 9M"]);
    expect(warnings.every((warning) => warning.reason === "option-removed")).toBe(true);
    expect(removalWarningText(warnings[0])).toBe(
      "Pink / 9M — 12 in stock. Will be switched off — we keep it so past orders and stock records stay correct.",
    );
  });

  it("says nothing about a version that was never saved in the first place", () => {
    const fresh = build();

    expect(removalWarnings([], fresh)).toEqual([]);
  });

  it("warns about a row removed by hand, and stops once it is put back", () => {
    const baseline = build().map((row) => ({ ...row, saved: true, id: `id-${row.key}` }));
    const removed = baseline.map((row, index) => (index === 0 ? { ...row, removed: true } : row));

    expect(removalWarnings(baseline, removed)).toHaveLength(1);
    expect(removalWarnings(baseline, removed)[0].reason).toBe("removed");
    expect(removalWarnings(baseline, baseline)).toEqual([]);
  });
});

describe("variantPayload", () => {
  it("leaves removed rows out and marks exactly one default", () => {
    const rows = build().map((row, index) => (index === 0 ? { ...row, removed: true } : row));
    const chosen = rows[2].key;

    const payload = variantPayload(rows, [osu], chosen);

    expect(payload).toHaveLength(5);
    expect(payload.filter((variant) => variant.isDefault)).toHaveLength(1);
    expect(payload.find((variant) => variant.isDefault)?.optionValues).toEqual(
      rows[2].optionValues,
    );
  });

  it("sends stock only for the shops still ticked", () => {
    const rows = build().map((row) => ({ ...row, stock: { [osu]: "3", [spintex]: "9" } }));

    const payload = variantPayload(rows, [osu], rows[0].key);

    expect(payload[0].stock).toEqual([{ shopId: osu, onHand: 3, reorderPoint: 2 }]);
  });

  it("keeps the reorder point the shop already set rather than inventing one", () => {
    const rows = build().map((row) => ({ ...row, reorderPoints: { [osu]: 7 } }));

    expect(variantPayload(rows, [osu], rows[0].key)[0].stock[0].reorderPoint).toBe(7);
  });

  it("omits a blank was-price instead of sending an empty string", () => {
    const rows = build().map((row) => ({ ...row, compareAtPrice: "" }));

    expect(variantPayload(rows, [osu], rows[0].key)[0]).not.toHaveProperty("compareAtPrice");
  });
});

describe("resolveDefaultKey", () => {
  it("moves the default off a version that has just been switched off", () => {
    const rows = build().map((row, index) => (index === 0 ? { ...row, isActive: false } : row));

    expect(resolveDefaultKey(rows, rows[0].key)).toBe(rows[1].key);
  });

  it("leaves a live choice alone", () => {
    const rows = build();

    expect(resolveDefaultKey(rows, rows[4].key)).toBe(rows[4].key);
  });
});

describe("invalidPriceKeys", () => {
  it("flags a cleared price and a was-price below the price being charged", () => {
    const rows = build();
    const broken = [
      { ...rows[0], price: "" },
      { ...rows[1], price: "40", compareAtPrice: "20" },
      { ...rows[2], price: "40", compareAtPrice: "60" },
      { ...rows[3], price: "0", removed: true },
    ];

    expect(invalidPriceKeys(broken)).toEqual([rows[0].key, rows[1].key]);
  });
});

describe("conflictingSkuKeys", () => {
  it("finds the row a 409 is about, because the server names a code and not a field", () => {
    const rows = build();
    const message = `The product code ${rows[3].sku} is already used elsewhere in your catalogue. Give this version a different code.`;

    expect(conflictingSkuKeys(rows, message)).toEqual([rows[3].key]);
  });

  it("lights up nothing rather than everything when the message names no code", () => {
    expect(conflictingSkuKeys(build(), "Could not save the product's versions.")).toEqual([]);
  });
});

describe("draftsFromVariants", () => {
  function variant(overrides: Partial<AdminProductVariant> = {}): AdminProductVariant {
    return {
      id: "variant-1",
      sku: "CL-1-PINK-3M",
      title: "Pink / 3M",
      price: 45,
      compareAtPrice: null,
      active: true,
      isDefault: true,
      optionValues: { colour: "Pink", size: "3M" },
      inventory: [
        {
          id: "level-1",
          variantId: "variant-1",
          shopId: osu,
          shopName: "Osu",
          shopLocation: "Osu",
          onHand: 12,
          reserved: 2,
          available: 10,
          reorderPoint: 4,
          updatedAt: "",
        },
      ],
      ...overrides,
    };
  }

  it("carries the stock, the reorder point and the code straight across", () => {
    const [draft] = draftsFromVariants([variant()], colourSize);

    expect(draft).toMatchObject({
      id: "variant-1",
      sku: "CL-1-PINK-3M",
      price: "45",
      compareAtPrice: "",
      saved: true,
      onHand: 12,
      stock: { [osu]: "12" },
      reorderPoints: { [osu]: 4 },
    });
  });

  it("ignores a stored value the product no longer offers, so the row still lines up", () => {
    // A legacy row carrying `{"gender":"Girls"}` used to sign differently from
    // the combination it represents, so the editor opened showing every version
    // as new and the save inserted twins that collided on the unique SKU.
    const [draft] = draftsFromVariants(
      [variant({ optionValues: { colour: "Pink", size: "3M", gender: "Girls" } })],
      colourSize,
    );

    expect(draft.optionValues).toEqual({ colour: "Pink", size: "3M" });
    expect(draft.key).toBe(draftsFromVariants([variant()], colourSize)[0].key);
  });

  it("collapses a legacy twin, keeping the live row", () => {
    const drafts = draftsFromVariants(
      [
        variant({ id: "dead", sku: "OLD", active: false }),
        variant({ id: "live", sku: "NEW", active: true }),
      ],
      colourSize,
    );

    expect(drafts).toHaveLength(1);
    expect(drafts[0].id).toBe("live");
  });
});

describe("a draft's shape", () => {
  it("holds numbers as the text that was typed, so a half-typed count survives", () => {
    const row: VariantDraft = build()[0];

    expect(typeof row.price).toBe("string");
    expect(typeof row.stock[osu]).toBe("string");
  });
});
