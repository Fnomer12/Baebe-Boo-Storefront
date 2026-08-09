import { z } from "zod";

const feeSchema = z.number().finite().min(0).max(100_000);
const daysSchema = z.int().min(0).max(365);

/**
 * Three distinct states, and they must stay distinct:
 *   absent    -> leave the stored value alone (PATCH only)
 *   null / "" -> clear it ("no free-delivery threshold")
 *   number    -> set it
 *
 * Collapsing null into undefined would make a threshold settable but never
 * removable. Note that "no threshold" is not the same as zero, which would
 * make every order qualify for free delivery.
 */
const clearableFeeSchema = z.preprocess(
  (value) => (value === "" ? null : value),
  feeSchema.nullable().optional(),
);

const clearableDaysSchema = z.preprocess(
  (value) => (value === "" ? null : value),
  daysSchema.nullable().optional(),
);

export const deliveryZoneIdSchema = z.uuid();

/**
 * Declared without defaults on purpose. `.partial()` does not strip a
 * `.default()`, so a base shape carrying them would make `{}` parse into
 * `{ regions: [], isActive: true }` — and an empty PATCH would silently
 * activate a zone and wipe its regions. Defaults are added only to the create
 * schema below.
 */
const deliveryZoneFields = {
  name: z.string().trim().min(1).max(120),
  regions: z.array(z.string().trim().min(1).max(120)).max(50),
  baseFee: feeSchema,
  freeDeliveryThreshold: clearableFeeSchema,
  estimatedDaysMin: clearableDaysSchema,
  estimatedDaysMax: clearableDaysSchema,
  isActive: z.boolean(),
};

/**
 * Mirrors the table's own
 * `check (estimated_days_max is null or estimated_days_max >= estimated_days_min)`.
 * Catching it here turns a raw Postgres constraint violation into a sentence a
 * shop manager can act on.
 */
function daysOrdered(zone: {
  estimatedDaysMin?: number | null;
  estimatedDaysMax?: number | null;
}) {
  // Only comparable when both are actual numbers; null clears and undefined
  // leaves the stored value alone, and neither can be ordered against.
  if (
    typeof zone.estimatedDaysMin !== "number" ||
    typeof zone.estimatedDaysMax !== "number"
  ) {
    return true;
  }
  return zone.estimatedDaysMax >= zone.estimatedDaysMin;
}

const DAYS_MESSAGE = "The latest delivery day cannot be before the earliest.";

export const deliveryZoneCreateSchema = z
  .object({
    ...deliveryZoneFields,
    regions: deliveryZoneFields.regions.default([]),
    isActive: deliveryZoneFields.isActive.default(true),
  })
  .refine(daysOrdered, { message: DAYS_MESSAGE, path: ["estimatedDaysMax"] });

export const deliveryZonePatchSchema = z
  .object(deliveryZoneFields)
  .partial()
  // Checks values, not keys: an optional field can survive parsing as an
  // explicitly-undefined key, which would defeat a key-count test.
  .refine((patch) => Object.values(patch).some((value) => value !== undefined), {
    message: "At least one delivery zone field is required.",
  })
  .refine(daysOrdered, { message: DAYS_MESSAGE, path: ["estimatedDaysMax"] });

export type DeliveryZoneCreateInput = z.infer<typeof deliveryZoneCreateSchema>;
export type DeliveryZonePatchInput = z.infer<typeof deliveryZonePatchSchema>;
