/**
 * Coercion between what an HTML form yields and what a zod schema accepts.
 *
 * WHY THIS EXISTS
 * ---------------
 * Three separate "I cannot create anything" bugs had one cause. The admin
 * forms are uncontrolled and read with `new FormData(form)`, then built into a
 * payload like:
 *
 *     startsAt: String(formData.get("startsAt") || "")
 *
 * An untouched field yields `""`. The matching schema field is
 * `.optional()` — and in zod, `.optional()` widens the type to admit
 * `undefined`, NOT `""`. So `""` still runs the string checks, fails, and the
 * route answers 400. The result:
 *
 *   - a promotion with no code and no dates → "Invalid promotion details."
 *   - a voucher with no recipient email     → "Invalid voucher details."
 *   - a store with no database name         → "Invalid store details."
 *
 * Each is the *normal* case for that form, so in practice none of the three
 * could be created at all.
 *
 * The second half of the same bug: `<input type="datetime-local">` yields
 * `"2026-08-06T14:30"` — no seconds, no timezone — and `z.string().datetime()`
 * requires a full ISO 8601 instant. So filling a date in failed too, which
 * left no way to submit the form at all.
 *
 * Everything here is pure, so the rules are pinned by tests rather than
 * rediscovered per form.
 */

// `boolean` is in the union for `checkbox()`, whose callers sometimes hold the
// value in React state rather than reading it back out of a FormData.
type FormValue = FormDataEntryValue | string | number | boolean | null | undefined;

function asText(value: FormValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  // A File lands here when a form has a file input; it is never a text field.
  return "";
}

/**
 * Text, or `undefined` when the user left it alone.
 *
 * This is the function that makes `.optional()` mean what everyone assumed it
 * meant. Use it for every field the form does not require.
 */
export function optionalText(value: FormValue): string | undefined {
  const text = asText(value);
  return text.length > 0 ? text : undefined;
}

/** Text, or `""`. For fields the schema requires, so zod reports the real error. */
export function requiredText(value: FormValue): string {
  return asText(value);
}

/**
 * A number, or `undefined` when blank.
 *
 * Note this treats a literal `0` as a real value. The previous inline idiom
 * was `Number(formData.get("x") || 0) || undefined`, which silently discarded
 * zero — so "0% off" and "minimum order GH₵0" both became "not set".
 */
export function optionalNumber(value: FormValue): number | undefined {
  const text = asText(value);
  if (text.length === 0) return undefined;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/** A number, or `NaN` so zod reports "expected number" rather than silently defaulting. */
export function requiredNumber(value: FormValue): number {
  const text = asText(value);
  return text.length === 0 ? Number.NaN : Number(text);
}

/** An unchecked checkbox is absent from FormData entirely; a checked one is `"on"`. */
export function checkbox(value: FormValue): boolean {
  return value === "on" || value === "true" || value === true;
}

/**
 * `<input type="datetime-local">` → a full ISO instant, or `undefined`.
 *
 * The input yields wall-clock time with no zone (`"2026-08-06T14:30"`).
 * `new Date()` interprets exactly that shape as LOCAL time, which is what the
 * person filling the form meant — 2:30pm to them is 2:30pm in Accra — and
 * `toISOString()` then converts it to the UTC instant the API stores.
 *
 * Returns `undefined` rather than `"Invalid Date"` for junk, so a malformed
 * value reads as "not set" instead of poisoning the payload.
 */
export function localDateTimeToIso(value: FormValue): string | undefined {
  const text = asText(value);
  if (text.length === 0) return undefined;
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.toISOString();
}

/**
 * The inverse, for populating an edit form from a stored instant.
 *
 * `datetime-local` refuses any value carrying a timezone, so a stored
 * `"2026-08-06T14:30:00.000Z"` must be rendered back as local wall-clock
 * `"2026-08-06T14:30"` or the field silently shows empty.
 */
export function isoToLocalDateTime(value: string | null | undefined): string {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  const pad = (part: number) => String(part).padStart(2, "0");
  return (
    `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}` +
    `T${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`
  );
}

/**
 * Drop every `undefined` before serialising.
 *
 * `JSON.stringify` already omits undefined properties, so this is belt and
 * braces for callers that inspect the payload — and it keeps a logged request
 * body readable.
 */
export function compact<T extends Record<string, unknown>>(payload: T): Partial<T> {
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (value !== undefined) next[key] = value;
  }
  return next as Partial<T>;
}
