/**
 * Shared Ghana phone helpers for storefront collection and SMS.
 *
 * Checkout, family signup, and account forms all collect the same number
 * that order and marketing SMS are sent to, so they share one canonical
 * form (+233XXXXXXXXX) and one validity rule. The FROG transport in
 * `src/lib/sms.ts` converts to its local 0XXXXXXXXX form at send time.
 */

const GHANA_NATIONAL_LENGTH = 9;

/** Strip a value to its 9-digit Ghana national number, or null. */
function toNationalNumber(raw: string | null | undefined): string | null {
  const digitsOnly = String(raw ?? "").replace(/[^\d]/g, "");
  if (!digitsOnly) return null;
  let nationalNumber = digitsOnly;
  if (nationalNumber.startsWith("233")) nationalNumber = nationalNumber.slice(3);
  if (nationalNumber.startsWith("0")) nationalNumber = nationalNumber.slice(1);
  if (nationalNumber.length !== GHANA_NATIONAL_LENGTH) return null;
  if (!/^\d{9}$/.test(nationalNumber)) return null;
  return nationalNumber;
}

/**
 * Normalize to the stored canonical form (+233XXXXXXXXX).
 * Accepts +233..., 233..., 0..., or bare 9-digit input.
 */
export function normalizeGhanaPhoneCanonical(raw: string | null | undefined): string | null {
  const nationalNumber = toNationalNumber(raw);
  if (!nationalNumber) return null;
  return `+233${nationalNumber}`;
}

/** True when the value is a complete Ghana mobile number. */
export function isValidGhanaPhone(raw: string | null | undefined): boolean {
  return normalizeGhanaPhoneCanonical(raw) !== null;
}

/**
 * Live-typing formatter for the checkout/family phone inputs: keeps the
 * +233 prefix while the customer types and caps at 9 national digits.
 */
export function formatGhanaPhoneInput(raw: string): string {
  const digitsOnly = String(raw ?? "").replace(/[^\d]/g, "");
  let nationalNumber = digitsOnly;
  if (nationalNumber.startsWith("233")) nationalNumber = nationalNumber.slice(3);
  if (nationalNumber.startsWith("0")) nationalNumber = nationalNumber.slice(1);
  return `+233${nationalNumber.slice(0, GHANA_NATIONAL_LENGTH)}`;
}

export const GHANA_PHONE_HELPER = "We send order and delivery updates by SMS to this number.";
export const GHANA_PHONE_ERROR = "Enter a valid Ghana number starting with +233.";
