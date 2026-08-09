import { z } from "zod";

/**
 * Shared zod helpers for admin request bodies.
 *
 * The client is now careful to send `undefined` rather than `""` for blank
 * optional fields (see `src/domain/forms/form-values.ts`), but the API is a
 * public surface and must not depend on a well-behaved caller. Every optional
 * field therefore defuses `""` and `null` server-side too.
 *
 * The pattern is lifted from `store-schemas.ts`, which already got this right
 * for URLs and emails; the bug was that it was never applied to the other
 * optional fields on the same schemas.
 */

/** `""` and `null` mean "not provided", for any inner schema. */
export function blankToUndefined<Schema extends z.ZodTypeAny>(schema: Schema) {
  return z.preprocess(
    (value) => (value === "" || value === null ? undefined : value),
    schema.optional(),
  );
}

/**
 * An ISO instant, accepting what a browser date input realistically sends.
 *
 * `z.string().datetime()` alone rejects `"2026-08-06T14:30"` — the exact shape
 * `<input type="datetime-local">` produces — so a filled-in date failed
 * validation just as reliably as a blank one. Normalising here means an
 * integration or a curl caller gets the same latitude as the admin UI.
 */
export const isoDateTimeSchema = z.preprocess((value) => {
  if (value === "" || value === null || value === undefined) return undefined;
  if (typeof value !== "string") return value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
}, z.string().datetime().optional());

/** A percentage, actually bounded. */
export const percentageSchema = z
  .number()
  .finite()
  .min(0, "A percentage cannot be negative.")
  .max(100, "A percentage cannot be more than 100.");

/** Money, in cedis. There is no currency argument anywhere by design. */
export const moneySchema = z.number().finite().min(0).max(1_000_000);

/**
 * Turn a zod failure into per-field messages the UI can attach to inputs.
 *
 * The routes previously answered every validation failure with one generic
 * string — "Invalid promotion details." — which told a non-technical admin
 * nothing about which of twelve fields was wrong, on a form that rejected the
 * normal case anyway.
 */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) {
    const path = issue.path.join(".") || "_";
    // First issue per field wins: it is the most specific, and stacking three
    // messages under one input is noise.
    if (!errors[path]) errors[path] = issue.message;
  }
  return errors;
}
