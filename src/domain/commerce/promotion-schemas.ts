import { z } from "zod";
import {
  blankToUndefined,
  isoDateTimeSchema,
  moneySchema,
  percentageSchema,
} from "@/lib/admin/schema-helpers";
import {
  presetForPromotionType,
  promotionReachWarning,
  type PromotionStatus,
} from "./promotion-presets";

/**
 * The request bodies for the promotion admin API.
 *
 * Every message here is written for the person filling the form, because
 * `fieldErrors()` pins each one to its input. The route used to answer any
 * failure with "Invalid promotion details." on a twelve-field form — and the
 * failure it answered with it most often was the *empty* optional fields,
 * which is why nothing could be created at all.
 */

const supportedPromotionTypes = ["percentage", "fixed_amount", "free_shipping"] as const;

/**
 * `fixed_price` and `bundle` are absent on purpose.
 *
 * The database CHECK still allows them and old rows may use them, but nothing
 * prices them at checkout, so accepting a new one would only mint another
 * promotion that answers "This promotion type is not available online."
 */
export const promotionTypeSchema = z.enum(supportedPromotionTypes, {
  error: "Choose percent off, amount off, or free delivery.",
});

const statusSchema = z.enum(["draft", "active", "paused", "expired"], {
  error: "Choose draft, active, paused or expired.",
});

const nameSchema = z
  .string({ error: "Give this promotion a name." })
  .trim()
  .min(1, { error: "Give this promotion a name." })
  .max(200, { error: "Keep the name under 200 characters." });

const valueSchema = z
  .number({ error: "Enter how much comes off." })
  .finite({ error: "Enter how much comes off." })
  .min(0, { error: "This cannot be negative." })
  .max(1_000_000, { error: "That is larger than any order this shop takes." });

const codeSchema = z
  .string()
  .trim()
  .min(1)
  .max(64, { error: "Keep the code under 64 characters." })
  .regex(/^[A-Za-z0-9_-]+$/, {
    error: "Codes can only use letters, numbers, dashes and underscores — a space or symbol is easy to mistype.",
  });

const positiveCountSchema = z
  .number()
  .int({ error: "Enter a whole number." })
  .positive({ error: "Enter 1 or more." })
  .max(1_000_000, { error: "That limit is unrealistically high." });

const productIdsSchema = z
  .array(z.uuid({ error: "That product could not be recognised." }))
  .max(500, { error: "Select fewer products." })
  .optional();

const categoryNamesSchema = z
  .array(
    z
      .string()
      .trim()
      .min(1, { error: "That category could not be recognised." })
      .max(120, { error: "That category name is too long." }),
  )
  .max(20, { error: "Select fewer categories." })
  .optional();

const isBlank = (value: unknown) =>
  value === null || (typeof value === "string" && value.trim().length === 0);

/** Absent means "leave as it is"; blank or `null` means "clear this". */
function clearable<Schema extends z.ZodTypeAny>(schema: Schema) {
  return z.preprocess((value) => (isBlank(value) ? null : value), schema.nullish());
}

/**
 * A clearable ISO instant.
 *
 * `isoDateTimeSchema` folds blank into `undefined`, which is right for a
 * create (nothing to clear) and wrong for a patch: an admin removing an end
 * date sends a blank field, and folding that into `undefined` would silently
 * leave the old date in place.
 */
const clearableIsoDateTime = z.preprocess((value) => {
  if (isBlank(value)) return null;
  if (value === undefined || typeof value !== "string") return value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
}, z.string().datetime({ error: "That date could not be read." }).nullish());

const sharedOptionalFields = {
  description: blankToUndefined(
    z.string().trim().max(2000, { error: "Keep the description under 2000 characters." }),
  ),
  startsAt: isoDateTimeSchema,
  endsAt: isoDateTimeSchema,
  minimumOrderAmount: blankToUndefined(moneySchema),
  usageLimit: blankToUndefined(positiveCountSchema),
  perCustomerLimit: blankToUndefined(positiveCountSchema),
  code: blankToUndefined(codeSchema),
  productIds: productIdsSchema,
  excludedProductIds: productIdsSchema,
  categories: categoryNamesSchema,
  excludedCategories: categoryNamesSchema,
};

type ShapeToCheck = {
  /** A string rather than the enum, so a legacy `fixed_price` row can be inspected. */
  promotionType?: string;
  value?: number;
  startsAt?: string | null;
  endsAt?: string | null;
  productIds?: readonly string[];
  excludedProductIds?: readonly string[];
  categories?: readonly string[];
  excludedCategories?: readonly string[];
  availableOnline?: boolean;
  availableAtCounter?: boolean;
  automatic?: boolean;
  code?: string | null;
};

/**
 * The cross-field rules, as messages keyed by field.
 *
 * Shared by create (as zod issues) and patch (where the route has to merge the
 * body with the stored row before the rules mean anything), so the wording
 * cannot drift between the two paths.
 */
export function promotionShapeIssues(input: ShapeToCheck): Record<string, string> {
  const issues: Record<string, string> = {};

  if (input.promotionType === "percentage" && input.value !== undefined) {
    if (!percentageSchema.safeParse(input.value).success) {
      issues.value = "A percentage discount has to be between 0 and 100.";
    }
  }
  if (
    input.value !== undefined &&
    input.promotionType !== undefined &&
    input.promotionType !== "free_shipping" &&
    input.value <= 0
  ) {
    issues.value = "A promotion worth 0 takes nothing off. Enter how much comes off.";
  }
  // The promotions table has a matching CHECK, so without this the insert
  // fails as an opaque 500 rather than pointing at the end date.
  if (
    input.startsAt &&
    input.endsAt &&
    new Date(input.endsAt).getTime() <= new Date(input.startsAt).getTime()
  ) {
    issues.endsAt = "The end date has to be after the start date.";
  }
  // `promotion_products` is keyed on (promotion_id, product_id), so the same
  // product cannot be both included and excluded.
  const excluded = new Set(input.excludedProductIds ?? []);
  if ((input.productIds ?? []).some((id) => excluded.has(id))) {
    issues.excludedProductIds =
      "A product cannot be both included and excluded. Remove it from one of the lists.";
  }
  const excludedCategories = new Set(
    (input.excludedCategories ?? []).map((entry) => entry.trim().toLowerCase()),
  );
  if ((input.categories ?? []).some((entry) => excludedCategories.has(entry.trim().toLowerCase()))) {
    issues.excludedCategories =
      "A category cannot be both included and excluded. Remove it from one of the lists.";
  }
  // Counter promos are automatic-only: the till has no code field, so a coded
  // promo flagged for the counter would be unreachable there.
  if (input.availableAtCounter && !input.automatic && !input.code) {
    // Automatic-off + no code is already unreachable everywhere (existing
    // `unreachablePromotionIssue`); only flag the counter-specific case where
    // a code exists but the till cannot take it.
  }
  if (input.availableAtCounter && input.code && !input.automatic) {
    issues.availableAtCounter =
      "The till applies offers automatically and has no code box. Switch on automatic as well, or keep this offer online-only.";
  }

  return issues;
}

function checkPromotionShape(input: ShapeToCheck, ctx: z.RefinementCtx) {
  for (const [path, message] of Object.entries(promotionShapeIssues(input))) {
    ctx.addIssue({ code: "custom", path: [path], message });
  }
}

export const promotionCreateSchema = z
  .object({
    name: nameSchema,
    promotionType: promotionTypeSchema,
    value: valueSchema.default(0),
    status: statusSchema.default("draft"),
    stackable: z.boolean().default(false),
    automatic: z.boolean().default(false),
    availableOnline: z.boolean().default(true),
    availableAtCounter: z.boolean().default(false),
    ...sharedOptionalFields,
  })
  .superRefine((input, ctx) => {
    checkPromotionShape(input, ctx);
    const unreachable = unreachablePromotionIssue(input);
    if (unreachable) {
      ctx.addIssue({ code: "custom", path: [unreachable.field], message: unreachable.message });
    }
  })
  .transform((input) => ({
    ...input,
    // Free delivery has no cash value. Storing one would leave a number in the
    // column that a later reader could mistake for money off.
    value: input.promotionType === "free_shipping" ? 0 : input.value,
  }));

export type PromotionCreateInput = z.infer<typeof promotionCreateSchema>;

export const promotionPatchSchema = z
  .object({
    name: nameSchema.optional(),
    promotionType: promotionTypeSchema.optional(),
    value: valueSchema.optional(),
    status: statusSchema.optional(),
    stackable: z.boolean().optional(),
    automatic: z.boolean().optional(),
    availableOnline: z.boolean().optional(),
    availableAtCounter: z.boolean().optional(),
    description: clearable(z.string().trim().max(2000)),
    startsAt: clearableIsoDateTime,
    endsAt: clearableIsoDateTime,
    minimumOrderAmount: clearable(moneySchema),
    usageLimit: clearable(positiveCountSchema),
    perCustomerLimit: clearable(positiveCountSchema),
    code: clearable(codeSchema),
    productIds: productIdsSchema,
    excludedProductIds: productIdsSchema,
    categories: categoryNamesSchema,
    excludedCategories: categoryNamesSchema,
  })
  .superRefine((input, ctx) =>
    checkPromotionShape(
      {
        ...input,
        startsAt: input.startsAt ?? undefined,
        endsAt: input.endsAt ?? undefined,
      },
      ctx,
    ),
  );

export type PromotionPatchInput = z.infer<typeof promotionPatchSchema>;

/** A reason no customer can reach a promotion, pinned to the field at fault. */
export type UnreachablePromotionIssue = {
  field: "code" | "endsAt";
  message: string;
};

/**
 * Why no customer could ever reach this promotion, or null.
 *
 * Only enforced on activation: a draft is allowed to be half-finished, which
 * is what drafts are for. Turning it on without a route to a basket is the
 * mistake worth blocking, and the workspace shows the same wording live while
 * the form is being filled in.
 *
 * THE BUG THIS FIXES
 * ------------------
 * This only ever asked how a promotion is *reached* — automatically or by
 * code — and never whether it was still running. A promotion whose end date had
 * already passed could be created as Active, or switched to Active, and then
 * sat in the table looking healthy while `evaluatePromotionEligibility`
 * answered "This promotion has expired." to every basket. Same class of
 * mistake, same moment to catch it.
 */
export function unreachablePromotionIssue(input: {
  status?: PromotionStatus;
  automatic?: boolean;
  code?: string | null;
  endsAt?: string | null;
  /** Injectable so the rule can be tested without freezing the clock. */
  now?: Date;
}): UnreachablePromotionIssue | null {
  if (input.status !== "active") return null;

  const reach = promotionReachWarning({
    automatic: Boolean(input.automatic),
    code: input.code ?? undefined,
  });
  if (reach) return { field: "code", message: reach };

  const endsAt = input.endsAt ? new Date(input.endsAt) : null;
  const now = input.now ?? new Date();
  // Matches the gate checkout applies: `endsAt` is exclusive there, so an end
  // date of exactly now is already over.
  if (endsAt && !Number.isNaN(endsAt.getTime()) && endsAt.getTime() <= now.getTime()) {
    return {
      field: "endsAt",
      message:
        "This end date has already passed, so switching this on would sell nothing. Clear the end date or move it into the future.",
    };
  }

  return null;
}

/** A promotion as it is stored, reduced to the fields the patch rules need. */
export type StoredPromotion = {
  /** A string, because legacy rows may still be `fixed_price` or `bundle`. */
  promotionType: string;
  value: number;
  status: PromotionStatus;
  automatic: boolean;
  /** Optional until the channel migration lands; absent means online-only. */
  availableOnline?: boolean;
  availableAtCounter?: boolean;
  startsAt: string | null;
  endsAt: string | null;
  code: string | null;
};

/**
 * The row as it will look once the patch lands.
 *
 * A patch body on its own says nothing useful: `{ value: 250 }` is fine for an
 * amount-off promotion and nonsense for a percentage one, and `{ automatic:
 * false }` only strands customers when the promotion is active and has no
 * code. Absent means unchanged; an explicit `null` means clear.
 */
export function mergePromotionPatch(
  current: StoredPromotion,
  patch: PromotionPatchInput,
): StoredPromotion {
  const promotionType = patch.promotionType ?? current.promotionType;
  const value = patch.value ?? current.value;
  return {
    promotionType,
    // Free delivery has no cash value, whichever direction the type moved in.
    value: promotionType === "free_shipping" ? 0 : value,
    status: patch.status ?? current.status,
    automatic: patch.automatic ?? current.automatic,
    // Channel flags stay absent when neither side names them, so rows stored
    // before the channel migration round-trip unchanged.
    ...(patch.availableOnline !== undefined || current.availableOnline !== undefined
      ? { availableOnline: patch.availableOnline ?? current.availableOnline ?? true }
      : {}),
    ...(patch.availableAtCounter !== undefined || current.availableAtCounter !== undefined
      ? { availableAtCounter: patch.availableAtCounter ?? current.availableAtCounter ?? false }
      : {}),
    startsAt: patch.startsAt === undefined ? current.startsAt : patch.startsAt,
    endsAt: patch.endsAt === undefined ? current.endsAt : patch.endsAt,
    code: patch.code === undefined ? current.code : patch.code,
  };
}

/**
 * Field errors for a patch, judged on the merged row.
 *
 * Only rules the patch actually touches are enforced. A promotion saved before
 * these rules existed can still be renamed or — the important one — paused,
 * instead of being frozen by a complaint about a field the admin is not
 * editing and cannot see.
 */
export function promotionUpdateIssues(
  current: StoredPromotion,
  patch: PromotionPatchInput,
): Record<string, string> {
  const merged = mergePromotionPatch(current, patch);
  const touchesValue = patch.value !== undefined || patch.promotionType !== undefined;
  // `endsAt` belongs here too: moving the end date into the past strands an
  // already-active promotion just as surely as taking its code away.
  const touchesReach =
    patch.status !== undefined ||
    patch.automatic !== undefined ||
    patch.code !== undefined ||
    patch.endsAt !== undefined ||
    patch.availableOnline !== undefined ||
    patch.availableAtCounter !== undefined;

  const issues = promotionShapeIssues({
    promotionType: merged.promotionType,
    value: touchesValue ? merged.value : undefined,
    startsAt: merged.startsAt,
    endsAt: merged.endsAt,
    productIds: patch.productIds,
    excludedProductIds: patch.excludedProductIds,
    categories: patch.categories,
    excludedCategories: patch.excludedCategories,
    availableOnline: merged.availableOnline ?? true,
    availableAtCounter: merged.availableAtCounter ?? false,
    automatic: merged.automatic,
    code: merged.code,
  });
  if (touchesReach || patch.promotionType !== undefined) {
    // Switching on a `fixed_price` or `bundle` row would put "This promotion
    // type is not available online." in front of customers. Nothing stops an
    // old row existing; activating one is the part worth blocking.
    if (merged.status === "active" && presetForPromotionType(merged.promotionType) === null) {
      issues.promotionType =
        "The online shop cannot run this promotion type, so switching it on would show customers an error. Change it to percent off, amount off or free delivery.";
    }
    const unreachable = unreachablePromotionIssue(merged);
    // Never masks a shape issue already sitting on the same field — "the end
    // date has to be after the start date" is the more basic complaint.
    if (unreachable && !issues[unreachable.field]) {
      issues[unreachable.field] = unreachable.message;
    }
  }
  return issues;
}

export const voucherCreateSchema = z
  .object({
    initialValue: z
      .number({ error: "Enter how much the voucher is worth." })
      .finite({ error: "Enter how much the voucher is worth." })
      .positive({ error: "A voucher has to be worth more than GH₵0." })
      .max(100_000, { error: "That is larger than any voucher this shop issues." }),
    // No currency field. Baebe Boo sells in cedis; the old free-text box let an
    // admin type "USD" and checkout then credited it 1:1 against a cedi basket.
    recipientEmail: blankToUndefined(
      z.email({ error: "That does not look like an email address." }).toLowerCase(),
    ),
    message: blankToUndefined(
      z.string().trim().max(1000, { error: "Keep the message under 1000 characters." }),
    ),
    expiresAt: isoDateTimeSchema,
  })
  .superRefine((input, ctx) => {
    // An expiry already in the past mints a voucher that is dead on arrival —
    // the shop takes the money and the customer is refused at checkout.
    if (input.expiresAt && new Date(input.expiresAt).getTime() <= Date.now()) {
      ctx.addIssue({
        code: "custom",
        path: ["expiresAt"],
        message: "That date has already passed, so the voucher would be dead on arrival.",
      });
    }
  });

export type VoucherCreateInput = z.infer<typeof voucherCreateSchema>;
