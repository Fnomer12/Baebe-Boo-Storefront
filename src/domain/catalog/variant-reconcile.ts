/**
 * Working out what to write when a seller saves a variable product.
 *
 * The naive version of this — delete the product's variants, insert the ones
 * on screen — cannot run against this database at all:
 *
 *   * `purchase_order_items.variant_id` and `goods_received_note_items.variant_id`
 *     are ON DELETE RESTRICT, so a variant that has ever been ordered from a
 *     supplier CANNOT be deleted. The delete fails and the save dies halfway.
 *   * `product_variants.sku` is UNIQUE across the whole table. Re-adding a
 *     combination that was removed earlier collides with the row still holding
 *     its SKU.
 *   * Deleting a variant would take its `inventory_levels` rows with it
 *     (ON DELETE CASCADE), silently zeroing stock the shop physically has.
 *
 * So removal is `is_active = false`, and re-adding the same combination
 * REACTIVATES the original row — stock, SKU, purchase history and all. That is
 * why variant identity is the option signature and not the SKU.
 *
 * The plan is data, not effects: a caller with `problems` must write nothing.
 * When executing, demote the outgoing default BEFORE promoting the new one —
 * `product_variants_one_default` is a partial unique index and will reject two.
 */

import {
  maxVariantsPerProduct,
  optionKey,
  optionValueKey,
  selectionSignature,
  selectionTitle,
  variantIsActive,
  variantOptionValues,
  type OptionSelection,
  type ProductOption,
  type VariantOptionSource,
} from "./product-options";
import { generateVariantSku } from "./variant-matrix";

export type ExistingVariant = VariantOptionSource & {
  id: string;
  sku: string;
  title?: string | null;
  price?: number | string | null;
  compareAtPrice?: number | string | null;
  costPrice?: number | string | null;
  weightGrams?: number | null;
  isDefault?: boolean;
  is_default?: boolean;
};

export type DesiredVariant = {
  /** Set when the row came back from the editor unchanged; otherwise matched by signature. */
  id?: string | null;
  sku?: string | null;
  optionValues: OptionSelection;
  price: number;
  compareAtPrice?: number | null;
  costPrice?: number | null;
  weightGrams?: number | null;
  isDefault?: boolean;
  isActive?: boolean;
};

export type VariantFields = {
  title: string;
  sku: string;
  price: number;
  compareAtPrice: number | null;
  costPrice: number | null;
  weightGrams: number | null;
  isDefault: boolean;
  isActive: boolean;
};

export type VariantCreate = VariantFields & {
  signature: string;
  optionValues: OptionSelection;
};

export type VariantUpdate = {
  id: string;
  sku: string;
  signature: string;
  optionValues: OptionSelection;
  changes: Partial<VariantFields & { optionValues: OptionSelection }>;
};

export type VariantProblemCode =
  | "unknown-variant"
  | "missing-option-value"
  | "unknown-option-value"
  | "unknown-option"
  | "duplicate-variant"
  | "too-many-variants"
  | "multiple-defaults"
  | "no-active-variant";

export type VariantProblem = {
  code: VariantProblemCode;
  message: string;
  /** Index into the `desired` array, so the UI can attach this to a row. */
  variantIndex?: number;
  path?: Array<string | number>;
};

export type VariantPlan = {
  creates: VariantCreate[];
  updates: VariantUpdate[];
  /** Rows switched back on. Separate from `updates` only so callers can report "3 restored". */
  reactivates: VariantUpdate[];
  /** Rows switched off. Never deletes — see the note at the top of this file. */
  deactivates: VariantUpdate[];
  /** The existing row that must end up default, or null when it is one of `creates`. */
  defaultId: string | null;
  /** Identifies the default among `creates`, which have no id until they are inserted. */
  defaultSignature: string;
  problems: VariantProblem[];
};

export type PlanContext = {
  /** Product SKU stem for generated variant SKUs. */
  skuBase?: string;
  /** SKUs spoken for elsewhere in the catalogue; variant SKUs are globally unique. */
  takenSkus?: Iterable<string>;
};

/** Reads the flag from either a raw DB row or an admin mapper's camelCase one. */
function isDefaultRow(variant: ExistingVariant): boolean {
  return Boolean(variant.isDefault ?? variant.is_default);
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeSelection(
  selection: OptionSelection | undefined,
  options: readonly ProductOption[],
): OptionSelection {
  const declared = new Set(options.map((option) => optionKey(option.name)));
  const normalized: OptionSelection = {};
  for (const [name, value] of Object.entries(selection || {})) {
    const key = optionKey(name);
    // Identity is the signature over the DECLARED options only. A stored key
    // the product no longer offers is not part of the combination — and a
    // product with no options has one variant, whatever its legacy row says.
    if (!declared.has(key)) continue;
    const text = typeof value === "string" ? value.trim() : "";
    if (!key || !text) continue;
    normalized[key] = text;
  }
  return normalized;
}

/**
 * Every way a desired row can fail to describe a real combination.
 *
 * Both directions matter. A variant missing "Size" cannot be told apart from
 * its siblings; a variant carrying a value the product no longer offers is
 * unreachable in the picker, which is a variant nobody can buy.
 */
function checkAgainstOptions(
  desired: DesiredVariant,
  index: number,
  selection: OptionSelection,
  options: readonly ProductOption[],
  problems: VariantProblem[],
): boolean {
  let ok = true;

  for (const option of options) {
    const key = optionKey(option.name);
    const value = selection[key];
    if (!value) {
      problems.push({
        code: "missing-option-value",
        message: `Choose a ${option.name} for every version of this product.`,
        variantIndex: index,
        path: ["variants", index, "optionValues", key],
      });
      ok = false;
      continue;
    }
    const allowed = option.values.map((candidate) => optionValueKey(candidate));
    if (!allowed.includes(optionValueKey(value))) {
      problems.push({
        code: "unknown-option-value",
        message: `"${value}" is not one of the ${option.name} choices you listed.`,
        variantIndex: index,
        path: ["variants", index, "optionValues", key],
      });
      ok = false;
    }
  }

  const declared = new Set(options.map((option) => optionKey(option.name)));
  for (const key of Object.keys(desired.optionValues || {})) {
    if (declared.has(optionKey(key))) continue;
    problems.push({
      code: "unknown-option",
      message: `This version has a "${key}" that the product does not offer.`,
      variantIndex: index,
      path: ["variants", index, "optionValues", optionKey(key)],
    });
    ok = false;
  }

  return ok;
}

function fieldsFor(desired: DesiredVariant, title: string, sku: string): VariantFields {
  return {
    title,
    sku,
    price: Number(desired.price),
    compareAtPrice: toNumber(desired.compareAtPrice),
    costPrice: toNumber(desired.costPrice),
    weightGrams: desired.weightGrams === null || desired.weightGrams === undefined
      ? null
      : Number(desired.weightGrams),
    isDefault: Boolean(desired.isDefault),
    isActive: desired.isActive !== false,
  };
}

/** Key-order-insensitive, because jsonb hands the keys back sorted by length. */
function sameSelection(first: OptionSelection, second: OptionSelection): boolean {
  const keys = Object.keys(first);
  if (keys.length !== Object.keys(second).length) return false;
  return keys.every((key) => first[key] === second[key]);
}

function diff(existing: ExistingVariant, next: VariantFields, keepSku: boolean): Partial<VariantFields> {
  const changes: Partial<VariantFields> = {};
  if ((existing.title || "") !== next.title) changes.title = next.title;
  if (!keepSku && existing.sku !== next.sku) changes.sku = next.sku;
  if (toNumber(existing.price) !== next.price) changes.price = next.price;
  if (toNumber(existing.compareAtPrice) !== next.compareAtPrice) changes.compareAtPrice = next.compareAtPrice;
  if (toNumber(existing.costPrice) !== next.costPrice) changes.costPrice = next.costPrice;
  const weight = existing.weightGrams === undefined ? null : existing.weightGrams;
  if (weight !== next.weightGrams) changes.weightGrams = next.weightGrams;
  return changes;
}

/**
 * What to create, update, switch back on and switch off — and nothing else.
 *
 * Matching runs id first (the editor round-trips ids for rows it loaded), then
 * signature, which is what catches "the seller deleted Blue last month and has
 * just re-added it". Two existing rows sharing a signature is legacy data: the
 * first claims the match and the rest fall out as deactivations, which is the
 * only safe way to collapse a duplicate that may be on a purchase order.
 */
export function planVariants(
  existing: readonly ExistingVariant[],
  desired: readonly DesiredVariant[],
  options: readonly ProductOption[] = [],
  context: PlanContext = {},
): VariantPlan {
  const problems: VariantProblem[] = [];
  const creates: VariantCreate[] = [];
  const updates: VariantUpdate[] = [];
  const reactivates: VariantUpdate[] = [];
  const deactivates: VariantUpdate[] = [];

  const byId = new Map<string, ExistingVariant>();
  const bySignature = new Map<string, ExistingVariant[]>();
  for (const variant of existing) {
    byId.set(variant.id, variant);
    const signature = selectionSignature(normalizeSelection(variantOptionValues(variant), options));
    const bucket = bySignature.get(signature);
    if (bucket) bucket.push(variant);
    else bySignature.set(signature, [variant]);
  }
  // Prefer the live row, then the current default, so the match lands on the
  // variant the shop is actually selling rather than an older twin.
  for (const bucket of bySignature.values()) {
    bucket.sort((first, second) => {
      const live = Number(variantIsActive(second)) - Number(variantIsActive(first));
      if (live !== 0) return live;
      return Number(isDefaultRow(second)) - Number(isDefaultRow(first));
    });
  }

  const claimed = new Set<string>();
  const takenSkus = new Set<string>();
  for (const sku of context.takenSkus || []) {
    if (typeof sku === "string" && sku.trim()) takenSkus.add(sku.trim());
  }
  for (const variant of existing) if (variant.sku) takenSkus.add(variant.sku);
  for (const variant of desired) if (variant.sku) takenSkus.add(variant.sku);

  if (desired.length > maxVariantsPerProduct) {
    problems.push({
      code: "too-many-variants",
      message: `A product can have at most ${maxVariantsPerProduct} versions. Remove some choices and try again.`,
      path: ["variants"],
    });
  }

  const seenSignatures = new Map<string, number>();
  type Resolved = {
    index: number;
    signature: string;
    selection: OptionSelection;
    fields: VariantFields;
    match: ExistingVariant | null;
    /** True only when the seller typed a SKU. Otherwise an existing row keeps its own. */
    skuFromCaller: boolean;
  };
  const resolved: Resolved[] = [];

  desired.forEach((row, index) => {
    const selection = normalizeSelection(row.optionValues, options);
    if (!checkAgainstOptions(row, index, selection, options, problems)) return;

    const signature = selectionSignature(selection);
    const firstSeen = seenSignatures.get(signature);
    if (firstSeen !== undefined) {
      problems.push({
        code: "duplicate-variant",
        message: `"${selectionTitle(selection, options)}" is listed twice. Each combination can only appear once.`,
        variantIndex: index,
        path: ["variants", index, "optionValues"],
      });
      return;
    }
    seenSignatures.set(signature, index);

    let match: ExistingVariant | null = null;
    if (row.id) {
      const byExplicitId = byId.get(row.id);
      if (!byExplicitId) {
        problems.push({
          code: "unknown-variant",
          message: "This version no longer exists. Reload the product and try again.",
          variantIndex: index,
          path: ["variants", index, "id"],
        });
        return;
      }
      if (!claimed.has(byExplicitId.id)) match = byExplicitId;
    }
    if (!match) {
      const candidate = (bySignature.get(signature) || []).find((sibling) => !claimed.has(sibling.id));
      if (candidate) match = candidate;
    }
    if (match) claimed.add(match.id);

    const title = selectionTitle(selection, options);
    const typedSku = typeof row.sku === "string" ? row.sku.trim() : "";
    const sku =
      typedSku ||
      match?.sku ||
      generateVariantSku(context.skuBase || "", selection, options, takenSkus);
    takenSkus.add(sku);

    resolved.push({
      index,
      signature,
      selection,
      fields: fieldsFor(row, title, sku),
      match,
      skuFromCaller: typedSku.length > 0,
    });
  });

  // Exactly one active default, always. The requested one wins; if it was
  // removed or never set, the first active row is promoted, because a product
  // page with no default variant renders no price at all.
  const requestedDefaults = resolved.filter((row) => row.fields.isDefault && row.fields.isActive);
  if (requestedDefaults.length > 1) {
    for (const extra of requestedDefaults.slice(1)) {
      problems.push({
        code: "multiple-defaults",
        message: "Only one version can be the one shown first.",
        variantIndex: extra.index,
        path: ["variants", extra.index, "isDefault"],
      });
    }
  }
  const activeRows = resolved.filter((row) => row.fields.isActive);
  const defaultRow = requestedDefaults[0] || activeRows[0] || null;
  if (!defaultRow && resolved.length > 0) {
    problems.push({
      code: "no-active-variant",
      message: "At least one version has to stay switched on for this product to be sold.",
      path: ["variants"],
    });
  }
  for (const row of resolved) row.fields.isDefault = row === defaultRow;

  for (const row of resolved) {
    if (!row.match) {
      creates.push({ ...row.fields, signature: row.signature, optionValues: row.selection });
      continue;
    }
    const wasActive = variantIsActive(row.match);
    // Never rewrite a SKU the seller did not retype: it is printed on labels,
    // referenced by purchase orders, and unique across the whole catalogue.
    const changes: VariantUpdate["changes"] = diff(row.match, row.fields, !row.skuFromCaller);
    if (wasActive !== row.fields.isActive) changes.isActive = row.fields.isActive;
    if (isDefaultRow(row.match) !== row.fields.isDefault) changes.isDefault = row.fields.isDefault;
    // Compared against the RAW stored values, not the normalized ones: an
    // option the product no longer declares has to be wiped out of the jsonb,
    // or the till goes on rendering a "Pink · 3M" chip for a simple product.
    if (!sameSelection(variantOptionValues(row.match), row.selection)) {
      changes.optionValues = row.selection;
    }

    const update: VariantUpdate = {
      id: row.match.id,
      sku: row.match.sku,
      signature: row.signature,
      optionValues: row.selection,
      changes,
    };
    if (!wasActive && row.fields.isActive) reactivates.push(update);
    else if (!row.fields.isActive && wasActive) deactivates.push(update);
    // An untouched row is not an update. Emitting one would bump `updated_at`
    // on every variant of every product on every save.
    else if (Object.keys(changes).length > 0) updates.push(update);
  }

  for (const variant of existing) {
    if (claimed.has(variant.id)) continue;
    if (!variantIsActive(variant) && !isDefaultRow(variant)) continue;
    const selection = normalizeSelection(variantOptionValues(variant), options);
    const changes: VariantUpdate["changes"] = {};
    if (variantIsActive(variant)) changes.isActive = false;
    // A row on its way out cannot keep `is_default`: the partial unique index
    // would then block the survivor being promoted.
    if (isDefaultRow(variant)) changes.isDefault = false;
    deactivates.push({
      id: variant.id,
      sku: variant.sku,
      signature: selectionSignature(selection),
      optionValues: selection,
      changes,
    });
  }

  return {
    creates,
    updates,
    reactivates,
    deactivates,
    defaultId: defaultRow?.match?.id ?? null,
    defaultSignature: defaultRow?.signature ?? "",
    problems,
  };
}
