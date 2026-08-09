import { z } from "zod";

export const contentPostSectionSchema = z.object({
  heading: z.string().trim().min(1).max(200),
  paragraphs: z.array(z.string().trim().min(1)).max(50).default([]),
  list: z.array(z.string().trim().min(1)).max(50).default([]),
});

export const contentPostBodySchema = z.object({
  deck: z.string().trim().max(2_000).default(""),
  sections: z.array(contentPostSectionSchema).max(50).default([]),
  note: z.string().trim().max(1_000).default(""),
});

export const contentPostStatusSchema = z.enum([
  "draft",
  "scheduled",
  "published",
  "archived",
]);

export const contentPostCreateSchema = z.object({
  authorId: z.string().uuid().optional(),
  slug: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must be lowercase kebab-case."),
  title: z.string().trim().min(1).max(200),
  excerpt: z.string().trim().max(1_000).default(""),
  body: contentPostBodySchema,
  heroImageUrl: z.union([z.url(), z.literal("")]).optional(),
  imageAlt: z.string().trim().max(500).optional(),
  status: contentPostStatusSchema.default("draft"),
  seoTitle: z.string().trim().max(200).optional(),
  seoDescription: z.string().trim().max(500).optional(),
  publishedAt: z.string().datetime().optional(),
  scheduledFor: z.string().datetime().optional(),
  category: z.string().trim().min(1).max(100).default("Parenting"),
  minutes: z.number().int().min(1).max(120).default(5),
  ctaLabel: z.string().trim().max(100).optional(),
  ctaHref: z.string().trim().max(500).optional(),
});

export const contentPostPatchSchema = contentPostCreateSchema
  .partial()
  .refine((patch) => Object.keys(patch).length > 0, {
    message: "At least one content field is required.",
  });

export const contentAuthorCreateSchema = z.object({
  name: z.string().trim().min(1).max(200),
  bio: z.string().trim().max(2_000).default(""),
  avatarUrl: z.union([z.url(), z.literal("")]).optional(),
  isActive: z.boolean().default(true),
});

export const contentAuthorPatchSchema = contentAuthorCreateSchema
  .partial()
  .refine((patch) => Object.keys(patch).length > 0, {
    message: "At least one author field is required.",
  });

export const contentPostProductSchema = z.object({
  productId: z.string().uuid(),
  sortOrder: z.number().int().min(0).default(0),
});

export const uuidSchema = z.uuid();
export const productIdSchema = z.uuid();

export type ContentPostSectionInput = z.infer<typeof contentPostSectionSchema>;
export type ContentPostBodyInput = z.infer<typeof contentPostBodySchema>;
export type ContentPostCreateInput = z.infer<typeof contentPostCreateSchema>;
export type ContentPostPatchInput = z.infer<typeof contentPostPatchSchema>;
export type ContentAuthorCreateInput = z.infer<typeof contentAuthorCreateSchema>;
export type ContentAuthorPatchInput = z.infer<typeof contentAuthorPatchSchema>;
export type ContentPostProductInput = z.infer<typeof contentPostProductSchema>;
