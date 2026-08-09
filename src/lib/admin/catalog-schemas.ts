import { z } from "zod";
import {
  maxOptionsPerProduct,
  maxValuesPerOption,
  maxVariantsPerProduct,
  optionKey,
  optionValueKey,
  selectionSignature,
  selectionTitle,
} from "@/domain/catalog/product-options";
import { blankToUndefined } from "./schema-helpers";

const moneySchema = z.number().finite().min(0).max(1_000_000);
const stockSchema = z.int().min(0).max(1_000_000);
const skuSchema = z
  .string()
  .trim()
  .min(2)
  .max(80)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._/-]*$/, "SKU contains unsupported characters.");

export const productIdSchema = z.uuid();

const availabilitySchema = z.object({
  shopId: z.uuid(),
  onHand: stockSchema,
  reorderPoint: stockSchema.default(0),
});

const productFieldsSchema = z.object({
  name: z.string().trim().min(1).max(180),
  description: z.string().trim().max(5_000),
  category: z.string().trim().min(1).max(100),
  ageRange: z.string().trim().min(1).max(100),
  gender: z.string().trim().min(1).max(60),
  sku: z.preprocess(
    (value) => (value === "" ? undefined : value),
    skuSchema.optional(),
  ),
  price: moneySchema,
  imageUrl: z.union([z.url(), z.literal("")]).optional(),
  gallery: z.array(z.url()).max(50).optional(),
  isActive: z.boolean(),
  /** Pins the product into the homepage "Family favourites" slots. */
  isFeatured: z.boolean().optional(),
});

/**
 * One attribute a seller declares: "Colour", with the values they stock.
 *
 * Stored in `products.options` as an ARRAY, never an object — see the note in
 * src/domain/catalog/product-options.ts about jsonb re-sorting object keys and
 * rendering every picker in the wrong order.
 */
export const productOptionSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Give this choice a name, like Colour or Size.")
    .max(60, "Keep the name short enough to fit above the buttons."),
  values: z
    .array(z.string().trim().min(1, "A choice cannot be blank.").max(80))
    .min(1, "Add at least one choice, or remove this option.")
    .max(maxValuesPerOption, `A single option can have at most ${maxValuesPerOption} choices.`),
});

/**
 * `{"colour": "Pink", "size": "3M"}` — always lowercase keys, always trimmed.
 *
 * The rekeying is not cosmetic. Every lookup in the domain layer, and the seed
 * script that wrote the ten products already in production, uses lowercase
 * keys; a payload with "Colour" would write a second, invisible attribute.
 */
const optionValuesSchema = z.preprocess(
  (value) => (value === null || value === undefined ? {} : value),
  z
    .record(
      z.string().trim().min(1).max(60),
      z.string().trim().min(1, "Choose a value for every option.").max(80),
    )
    .superRefine((values, context) => {
      const seen = new Set<string>();
      for (const name of Object.keys(values)) {
        const key = optionKey(name);
        if (seen.has(key)) {
          context.addIssue({
            code: "custom",
            path: [name],
            message: `This version sets ${name} twice.`,
          });
        }
        seen.add(key);
      }
    })
    .transform((values) =>
      Object.fromEntries(
        Object.entries(values).map(([name, value]) => [optionKey(name), value.trim()]),
      ),
    ),
);

/**
 * One row of the variant grid.
 *
 * There is deliberately no `title`. Titles are computed from the option values
 * (`selectionTitle`), because a client-supplied one is exactly how a 70-character
 * product name ended up rendering as a size chip on the storefront. Sending one
 * is rejected outright rather than ignored, so the caller finds out.
 */
export const variantInputSchema = z
  .object({
    id: blankToUndefined(z.uuid()),
    sku: blankToUndefined(skuSchema),
    optionValues: optionValuesSchema,
    price: moneySchema,
    compareAtPrice: blankToUndefined(moneySchema),
    costPrice: blankToUndefined(moneySchema),
    weightGrams: blankToUndefined(z.int().min(0).max(1_000_000)),
    isDefault: z.boolean().default(false),
    isActive: z.boolean().default(true),
    stock: z.array(availabilitySchema).max(100).optional(),
    title: z
      .never({ error: "Version names are built from the options — do not send one." })
      .optional(),
  })
  .superRefine((variant, context) => {
    // `product_variants` has a check constraint for this. Without the same rule
    // here the save reaches Postgres and comes back as an opaque 500.
    if (variant.compareAtPrice !== undefined && variant.compareAtPrice < variant.price) {
      context.addIssue({
        code: "custom",
        path: ["compareAtPrice"],
        message: "The was-price has to be higher than the price you are charging.",
      });
    }
  });

type VariantGraph = {
  options: z.infer<typeof productOptionSchema>[];
  variants: z.infer<typeof variantInputSchema>[];
  availability?: z.infer<typeof availabilitySchema>[];
};

function refineShopAllocations(
  allocations: readonly { shopId: string }[],
  context: z.RefinementCtx,
  path: Array<string | number>,
) {
  const seen = new Set<string>();
  allocations.forEach((allocation, index) => {
    if (seen.has(allocation.shopId)) {
      context.addIssue({
        code: "custom",
        path: [...path, index, "shopId"],
        message: "Each shop can appear only once.",
      });
    }
    seen.add(allocation.shopId);
  });
}

/**
 * Everything that has to be true of an option list and its variant grid.
 *
 * Shared by create and replace so the two cannot drift: the whole reason
 * `product-taxonomy.ts` exists is that the create and edit forms already had
 * their own copies of a shared list and disagreed.
 *
 * Every issue carries the path of the specific input that caused it. A
 * twelve-row grid answered with one generic string tells a shop owner nothing.
 */
export function refineVariantGraph(graph: VariantGraph, context: z.RefinementCtx) {
  const optionKeys: string[] = [];
  const seenOptions = new Set<string>();

  graph.options.forEach((option, index) => {
    const key = optionKey(option.name);
    optionKeys.push(key);
    if (seenOptions.has(key)) {
      context.addIssue({
        code: "custom",
        path: ["options", index, "name"],
        message: `You already have an option called "${option.name}".`,
      });
    }
    seenOptions.add(key);

    const seenValues = new Set<string>();
    option.values.forEach((value, valueIndex) => {
      const valueKey = optionValueKey(value);
      if (seenValues.has(valueKey)) {
        context.addIssue({
          code: "custom",
          path: ["options", index, "values", valueIndex],
          message: `"${value}" is already one of the ${option.name} choices.`,
        });
      }
      seenValues.add(valueKey);
    });
  });

  if (graph.options.length > 0 && graph.variants.length === 0) {
    context.addIssue({
      code: "custom",
      path: ["variants"],
      message: "Generate the versions for these options before saving.",
    });
  }

  const allowedValues = new Map(
    graph.options.map((option) => [
      optionKey(option.name),
      new Set(option.values.map((value) => optionValueKey(value))),
    ]),
  );
  const shopIds = new Set((graph.availability || []).map((allocation) => allocation.shopId));
  const signatures = new Map<string, number>();
  let defaults = 0;

  graph.variants.forEach((variant, index) => {
    for (const [optionIndex, key] of optionKeys.entries()) {
      if (!variant.optionValues[key]) {
        context.addIssue({
          code: "custom",
          path: ["variants", index, "optionValues", key],
          message: `Choose a ${graph.options[optionIndex].name} for this version.`,
        });
        continue;
      }
      if (!allowedValues.get(key)?.has(optionValueKey(variant.optionValues[key]))) {
        context.addIssue({
          code: "custom",
          path: ["variants", index, "optionValues", key],
          message: `"${variant.optionValues[key]}" is not one of the ${graph.options[optionIndex].name} choices you listed.`,
        });
      }
    }

    for (const key of Object.keys(variant.optionValues)) {
      if (allowedValues.has(key)) continue;
      context.addIssue({
        code: "custom",
        path: ["variants", index, "optionValues", key],
        // Unreachable in the picker is unsellable, so this is an error and not
        // a value we quietly drop.
        message: `This version has a "${key}" that the product does not offer.`,
      });
    }

    const signature = selectionSignature(variant.optionValues);
    const twin = signatures.get(signature);
    if (twin !== undefined) {
      context.addIssue({
        code: "custom",
        path: ["variants", index, "optionValues"],
        message: `"${selectionTitle(variant.optionValues, graph.options)}" is already listed on row ${twin + 1}.`,
      });
    } else {
      signatures.set(signature, index);
    }

    if (variant.isDefault) {
      defaults += 1;
      if (defaults > 1) {
        context.addIssue({
          code: "custom",
          path: ["variants", index, "isDefault"],
          message: "Only one version can be the one shown first.",
        });
      }
      if (!variant.isActive) {
        context.addIssue({
          code: "custom",
          path: ["variants", index, "isDefault"],
          message: "The version shown first has to be switched on.",
        });
      }
    }

    if (variant.stock) {
      refineShopAllocations(variant.stock, context, ["variants", index, "stock"]);
      variant.stock.forEach((allocation, stockIndex) => {
        if (shopIds.size > 0 && !shopIds.has(allocation.shopId)) {
          context.addIssue({
            code: "custom",
            path: ["variants", index, "stock", stockIndex, "shopId"],
            message: "Add this shop to the product before giving it stock.",
          });
        }
      });
    }
  });

  if (graph.variants.length > 0 && !graph.variants.some((variant) => variant.isActive)) {
    context.addIssue({
      code: "custom",
      path: ["variants"],
      message: "At least one version has to stay switched on.",
    });
  }
}

export const productCreateSchema = productFieldsSchema
  .extend({
    description: productFieldsSchema.shape.description.default(""),
    isActive: productFieldsSchema.shape.isActive.default(true),
    availability: z.array(availabilitySchema).min(1).max(100),
    // Defaulted so a simple product — which is still the common case, and what
    // the upload form sends — parses exactly as it did before variants existed.
    options: z.array(productOptionSchema).max(maxOptionsPerProduct).default([]),
    variants: z.array(variantInputSchema).max(maxVariantsPerProduct).default([]),
  })
  .superRefine((product, context) => {
    refineShopAllocations(product.availability, context, ["availability"]);
    refineVariantGraph(product, context);
  });

/**
 * The whole option list and variant grid of an existing product, at once.
 *
 * Variants are reconciled, not replaced: `planVariants` matches by option
 * signature and switches removed rows off, because a variant that has ever
 * been on a purchase order cannot be deleted and its SKU cannot be reused.
 */
export const productVariantsReplaceSchema = z
  .object({
    options: z.array(productOptionSchema).max(maxOptionsPerProduct).default([]),
    variants: z.array(variantInputSchema).max(maxVariantsPerProduct).default([]),
    // The product's shops, when the caller resends them. Per-variant stock is
    // checked against this list; an empty list just means "not resending".
    availability: z.array(availabilitySchema).max(100).default([]),
  })
  .superRefine((graph, context) => {
    refineShopAllocations(graph.availability, context, ["availability"]);
    refineVariantGraph(graph, context);
  });

export const productPatchSchema = productFieldsSchema
  .partial()
  .refine((patch) => Object.keys(patch).length > 0, {
    message: "At least one product field is required.",
  });

export const inventoryAdjustmentSchema = z.object({
  onHand: stockSchema,
  reorderPoint: stockSchema.optional(),
});

export const inventoryQuerySchema = z.object({
  shopId: z.uuid().optional(),
  productId: z.uuid().optional(),
  lowStock: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});

export type ProductCreateInput = z.infer<typeof productCreateSchema>;
export type ProductPatchInput = z.infer<typeof productPatchSchema>;
export type ProductOptionInput = z.infer<typeof productOptionSchema>;
export type VariantInput = z.infer<typeof variantInputSchema>;
export type ProductVariantsReplaceInput = z.infer<typeof productVariantsReplaceSchema>;
export type InventoryAdjustmentInput = z.infer<
  typeof inventoryAdjustmentSchema
>;
