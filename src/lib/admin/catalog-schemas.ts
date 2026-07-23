import { z } from "zod";

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
  isActive: z.boolean(),
});

export const productCreateSchema = productFieldsSchema
  .extend({
    description: productFieldsSchema.shape.description.default(""),
    isActive: productFieldsSchema.shape.isActive.default(true),
    availability: z.array(availabilitySchema).min(1).max(100),
  })
  .superRefine((product, context) => {
    const seen = new Set<string>();
    for (const allocation of product.availability) {
      if (seen.has(allocation.shopId)) {
        context.addIssue({
          code: "custom",
          path: ["availability"],
          message: "Each shop can appear only once.",
        });
      }
      seen.add(allocation.shopId);
    }
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
export type InventoryAdjustmentInput = z.infer<
  typeof inventoryAdjustmentSchema
>;
