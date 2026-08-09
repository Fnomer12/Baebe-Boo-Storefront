/**
 * Pure mapping helpers between a signed-in customer's account data and the
 * checkout form. Checkout keeps one free-text address blob while the account
 * stores structured addresses, so both directions need translation:
 * prefill (structured → text) and post-payment auto-save (text → structured).
 */

export type SavedAddressSummary = {
  id: string;
  label: string | null;
  recipientName: string;
  phone: string;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  region: string;
  digitalAddress: string | null;
  deliveryInstructions: string | null;
  isDefault: boolean;
};

/** Mirrors `addressMutationSchema` in src/lib/account/customer-workflows.ts. */
export type AddressSavePayload = {
  label: string;
  recipientName: string;
  phone: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  region: string;
  digitalAddress?: string;
  deliveryInstructions?: string;
};

const GHANA_POST_PATTERN = /^[A-Z]{2,3}-\d{3,4}-\d{3,4}$/;

/**
 * The checkout phone field's digit pipeline as a pure function: strip
 * formatting, drop a 233 country prefix or leading 0, and accept only a full
 * 9-digit national number. Anything shorter would prefill a value the submit
 * validation then rejects — worse than leaving the field empty.
 */
export function normalizeGhanaPhone(raw: string | null | undefined): string | null {
  const digitsOnly = (raw ?? "").replace(/[^\d]/g, "");
  let nationalNumber = digitsOnly;
  if (nationalNumber.startsWith("233")) nationalNumber = nationalNumber.slice(3);
  if (nationalNumber.startsWith("0")) nationalNumber = nationalNumber.slice(1);
  if (nationalNumber.length !== 9) return null;
  return `+233${nationalNumber}`;
}

/** One line for the checkout textarea, matching its "street, area, landmark" placeholder. */
export function composeAddressText(address: SavedAddressSummary): string {
  return [address.addressLine1, address.addressLine2, address.city, address.region]
    .map((part) => (part ?? "").trim())
    .filter(Boolean)
    .join(", ");
}

/**
 * Split checkout's free-text address across the two structured line fields.
 * Line 1 is capped at 160 by the schema; overflow moves to line 2 at a word
 * boundary rather than being cut mid-word.
 */
function splitAddressLines(blob: string): { addressLine1: string; addressLine2: string } {
  const lines = blob
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  let addressLine1 = lines[0] ?? "";
  let addressLine2 = lines.slice(1).join(", ");
  if (addressLine1.length > 160) {
    const cut = Math.max(
      addressLine1.lastIndexOf(",", 160),
      addressLine1.lastIndexOf(" ", 160),
    );
    const boundary = cut > 40 ? cut : 160;
    const overflow = addressLine1.slice(boundary).replace(/^[\s,]+/, "");
    addressLine1 = addressLine1.slice(0, boundary).trim();
    addressLine2 = [overflow, addressLine2].filter(Boolean).join(", ");
  }
  return { addressLine1, addressLine2: addressLine2.slice(0, 160) };
}

/**
 * Build a saved-address payload from checkout form state after a successful
 * delivery order, or null when no valid payload can be built. Null is the
 * correct failure mode: this runs fire-and-forget after payment, so a payload
 * the server would 400 is worth less than no request at all.
 *
 * City and region come from the chosen delivery zone — checkout never asks
 * for them separately, and the zone is the only structured locality the
 * customer confirmed. The copy is editable later under /account/addresses.
 */
export function buildAutoSaveAddressPayload(input: {
  customerName: string;
  customerPhone: string;
  deliveryAddress: string;
  digitalAddress: string;
  deliveryInstructions: string;
  zoneName: string | null | undefined;
  zoneRegions: readonly string[] | null | undefined;
}): AddressSavePayload | null {
  const recipientName = input.customerName.trim().slice(0, 100);
  if (recipientName.length < 2) return null;

  const phone = normalizeGhanaPhone(input.customerPhone);
  if (!phone) return null;

  const { addressLine1, addressLine2 } = splitAddressLines(input.deliveryAddress);
  if (addressLine1.length < 4) return null;

  const city = (input.zoneName ?? "").trim().slice(0, 80);
  if (city.length < 2) return null;
  const region = ((input.zoneRegions?.[0] ?? "").trim() || city).slice(0, 80);

  const digitalAddress = input.digitalAddress.trim().toUpperCase();
  const deliveryInstructions = input.deliveryInstructions.trim().slice(0, 500);

  return {
    label: "Delivery address",
    recipientName,
    phone,
    addressLine1,
    ...(addressLine2 ? { addressLine2 } : {}),
    city,
    region,
    ...(GHANA_POST_PATTERN.test(digitalAddress) ? { digitalAddress } : {}),
    ...(deliveryInstructions ? { deliveryInstructions } : {}),
  };
}
