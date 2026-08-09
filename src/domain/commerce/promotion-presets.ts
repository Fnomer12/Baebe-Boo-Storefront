import { formatCedis } from "../money";

/**
 * The three offers a shop owner actually runs, and the payload each one means.
 *
 * WHY THIS EXISTS
 * ---------------
 * The create form used to be twelve flat fields, one of which was a `Type`
 * dropdown with five options. Three of those five — `fixed_price`, `bundle`
 * and `free_shipping` — had no implementation at checkout, so choosing them
 * produced a promotion that told every customer "This promotion type is not
 * available online." The other two required the owner to know that "Value"
 * means percent for one type and cedis for another, with nothing on screen
 * saying so.
 *
 * A preset is the sentence the owner already has in their head — "20% off
 * everything", "GH₵50 off", "free delivery" — and this module is the single
 * place that turns it into the row the database stores. Keeping the mapping
 * pure means the wording on screen and the payload on the wire cannot drift,
 * and both are pinned by tests.
 */

export type PromotionPresetId = "percent_off" | "amount_off" | "free_delivery";

/** Only the types checkout can honour. `fixed_price` and `bundle` are not here. */
export type SupportedPromotionType = "percentage" | "fixed_amount" | "free_shipping";

export type PromotionStatus = "draft" | "active" | "paused" | "expired";

export type PromotionPreset = {
  id: PromotionPresetId;
  label: string;
  /** One line under the tile, in the owner's words rather than the schema's. */
  blurb: string;
  promotionType: SupportedPromotionType;
  /** Null when the preset has no amount to ask for. */
  amountLabel: string | null;
  amountHint: string | null;
  /** Placeholder for the name field, so the owner is not staring at a blank box. */
  namePlaceholder: string;
};

export const promotionPresets: readonly PromotionPreset[] = [
  {
    id: "percent_off",
    label: "Percent off",
    blurb: "Takes a share off the basket — 20% off everything, or off orders over an amount.",
    promotionType: "percentage",
    amountLabel: "Percent off",
    amountHint:
      "How much of the basket comes off, as a percentage. Enter 20 for 20% off. Delivery is never included.",
    namePlaceholder: "20% off everything",
  },
  {
    id: "amount_off",
    label: "Amount off",
    blurb: "Takes a flat sum off the basket — GH₵50 off, however much they spend.",
    promotionType: "fixed_amount",
    amountLabel: "Amount off (GH₵)",
    amountHint:
      "The cash amount that comes off the basket. If the basket is worth less than this, the customer simply pays nothing for the items — never less than nothing.",
    namePlaceholder: "GH₵50 off",
  },
  {
    id: "free_delivery",
    label: "Free delivery",
    blurb: "Drops the delivery fee to zero. Item prices stay as they are.",
    promotionType: "free_shipping",
    amountLabel: null,
    amountHint: null,
    namePlaceholder: "Free delivery weekend",
  },
];

export function presetById(id: PromotionPresetId): PromotionPreset {
  const preset = promotionPresets.find((candidate) => candidate.id === id);
  // The type makes this unreachable; the fallback keeps a stale saved draft
  // from crashing the workspace.
  return preset ?? promotionPresets[0];
}

/**
 * Which preset an existing row edits as, or null if checkout cannot run it.
 *
 * Promotions created before the dead types were removed still sit in the
 * table. They open as read-only rather than pretending to be editable under a
 * preset that would silently change what they do.
 */
export function presetForPromotionType(promotionType: string): PromotionPresetId | null {
  const preset = promotionPresets.find(
    (candidate) => candidate.promotionType === promotionType,
  );
  return preset?.id ?? null;
}

export type PromotionDraft = {
  preset: PromotionPresetId;
  name: string;
  description?: string;
  /** Percent for `percent_off`, cedis for `amount_off`, ignored otherwise. */
  amount?: number;
  minimumOrderAmount?: number;
  code?: string;
  automatic: boolean;
  stackable: boolean;
  status: PromotionStatus;
  startsAt?: string;
  endsAt?: string;
  usageLimit?: number;
  perCustomerLimit?: number;
  productIds?: readonly string[];
  excludedProductIds?: readonly string[];
};

export type PromotionPayload = {
  name: string;
  description?: string;
  promotionType: SupportedPromotionType;
  value: number;
  status: PromotionStatus;
  startsAt?: string;
  endsAt?: string;
  minimumOrderAmount?: number;
  usageLimit?: number;
  perCustomerLimit?: number;
  stackable: boolean;
  automatic: boolean;
  code?: string;
  productIds: string[];
  excludedProductIds: string[];
};

export function toPromotionPayload(draft: PromotionDraft): PromotionPayload {
  const preset = presetById(draft.preset);
  const code = draft.code?.trim().toUpperCase();
  return {
    name: draft.name.trim(),
    description: draft.description?.trim() || undefined,
    promotionType: preset.promotionType,
    // Free delivery has no amount to enter, and a stray value on that row is
    // how a "free delivery" promotion ends up taking cash off a basket.
    value: preset.amountLabel === null ? 0 : (draft.amount ?? 0),
    status: draft.status,
    startsAt: draft.startsAt || undefined,
    endsAt: draft.endsAt || undefined,
    minimumOrderAmount: draft.minimumOrderAmount,
    usageLimit: draft.usageLimit,
    perCustomerLimit: draft.perCustomerLimit,
    stackable: draft.stackable,
    automatic: draft.automatic,
    code: code || undefined,
    productIds: [...(draft.productIds ?? [])],
    excludedProductIds: [...(draft.excludedProductIds ?? [])],
  };
}

/**
 * The offer as a customer would hear it, for the preview under the form.
 *
 * The owner should be able to read this line back and recognise the promotion
 * they meant to create, without decoding "fixed_amount / value 50".
 */
export function describePromotion(input: {
  preset: PromotionPresetId;
  amount?: number;
  minimumOrderAmount?: number;
}): string {
  const qualifier =
    input.minimumOrderAmount && input.minimumOrderAmount > 0
      ? `orders over ${formatCedis(input.minimumOrderAmount)}`
      : "every order";

  if (input.preset === "free_delivery") {
    return `Free delivery on ${qualifier}.`;
  }
  if (input.preset === "percent_off") {
    const percent = input.amount ?? 0;
    return `${trimNumber(percent)}% off ${qualifier}.`;
  }
  return `${formatCedis(input.amount ?? 0)} off ${qualifier}.`;
}

/**
 * The combination that produces a promotion nobody can ever use.
 *
 * A promotion reaches a basket in exactly two ways: it applies automatically,
 * or the customer types its code. With neither, the row is created, looks
 * active in the table, and is silently unreachable — which is the kind of bug
 * an owner only finds by wondering why a campaign sold nothing.
 */
export function promotionReachWarning(input: {
  automatic: boolean;
  code?: string;
}): string | null {
  if (input.automatic || input.code?.trim()) return null;
  return "No customer can use this yet. Either switch on “Apply automatically” or give it a code for customers to type at checkout.";
}

/** 25 → "25", 12.5 → "12.5". Percentages read badly with forced decimals. */
function trimNumber(value: number): string {
  if (!Number.isFinite(value)) return "0";
  return String(Math.round(value * 100) / 100);
}
