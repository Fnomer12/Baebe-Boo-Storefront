import { z } from "zod";

const optionalTrimmedText = (maximum: number) =>
  z
    .string()
    .trim()
    .max(maximum)
    .optional()
    .transform((value) => value || undefined);

export const addressMutationSchema = z.object({
  label: optionalTrimmedText(40),
  recipientName: z.string().trim().min(2).max(100),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[0-9 ()-]{7,20}$/, "Enter a valid phone number."),
  addressLine1: z.string().trim().min(4).max(160),
  addressLine2: optionalTrimmedText(160),
  city: z.string().trim().min(2).max(80),
  region: z.string().trim().min(2).max(80),
  digitalAddress: optionalTrimmedText(24).transform((value, context) => {
    if (!value) return undefined;
    const normalized = value.toUpperCase();
    if (!/^[A-Z]{2,3}-\d{3,4}-\d{3,4}$/.test(normalized)) {
      context.addIssue({
        code: "custom",
        message: "Enter a valid GhanaPost GPS address, for example GA-183-8164.",
      });
      return z.NEVER;
    }
    return normalized;
  }),
  deliveryInstructions: optionalTrimmedText(500),
  isDefault: z.boolean().default(false),
});

const returnItemSchema = z.object({
  orderItemId: z.uuid(),
  quantity: z.number().int().min(1).max(100),
});

export const returnRequestSchema = z
  .object({
    orderId: z.uuid(),
    reason: z.string().trim().min(10).max(300),
    notes: optionalTrimmedText(1_500),
    items: z.array(returnItemSchema).min(1).max(20),
  })
  .superRefine(({ items }, context) => {
    const seen = new Set<string>();
    items.forEach((item, index) => {
      if (seen.has(item.orderItemId)) {
        context.addIssue({
          code: "custom",
          path: ["items", index, "orderItemId"],
          message: "Each order item can only be included once.",
        });
      }
      seen.add(item.orderItemId);
    });
  });

export const verifiedReviewSchema = z.object({
  orderId: z.uuid(),
  productId: z.uuid(),
  rating: z.number().int().min(1).max(5),
  title: optionalTrimmedText(120),
  body: z.string().trim().min(20).max(2_000),
});

export const profileMutationSchema = z.object({
  fullName: optionalTrimmedText(160),
  phone: optionalTrimmedText(20).transform((value, context) => {
    if (!value) return undefined;
    if (!/^\+?[0-9 ()-]{7,20}$/.test(value)) {
      context.addIssue({
        code: "custom",
        message: "Enter a valid phone number.",
      });
      return z.NEVER;
    }
    return value;
  }),
  dateOfBirth: optionalTrimmedText(10).transform((value, context) => {
    if (!value) return undefined;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      context.addIssue({ code: "custom", message: "Enter a valid date." });
      return z.NEVER;
    }
    return value;
  }),
  marketingStatus: z.enum(["unknown", "subscribed", "unsubscribed"]).default("unknown"),
});

export const childMutationSchema = z.object({
  firstName: optionalTrimmedText(100),
  dateOfBirth: optionalTrimmedText(10).transform((value, context) => {
    if (!value) return undefined;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      context.addIssue({ code: "custom", message: "Enter a valid date." });
      return z.NEVER;
    }
    return value;
  }),
  ageRangeTaxonomyId: z.uuid().optional(),
});

export const registryMutationSchema = z.object({
  title: z.string().trim().min(1).max(160),
  eventDate: optionalTrimmedText(10).transform((value, context) => {
    if (!value) return undefined;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      context.addIssue({ code: "custom", message: "Enter a valid date." });
      return z.NEVER;
    }
    return value;
  }),
  status: z.enum(["draft", "active", "closed"]).default("active"),
});

export const registryItemSchema = z.object({
  registryId: z.uuid(),
  productId: z.uuid(),
  variantId: z.uuid().optional(),
  requestedQuantity: z.number().int().min(1).max(100).default(1),
  priority: z.enum(["low", "normal", "high"]).default("normal"),
});

export type AddressMutation = z.infer<typeof addressMutationSchema>;
export type ReturnRequestMutation = z.infer<typeof returnRequestSchema>;
export type VerifiedReviewMutation = z.infer<typeof verifiedReviewSchema>;
export type ProfileMutation = z.infer<typeof profileMutationSchema>;
export type ChildMutation = z.infer<typeof childMutationSchema>;
export type RegistryMutation = z.infer<typeof registryMutationSchema>;
export type RegistryItemMutation = z.infer<typeof registryItemSchema>;
