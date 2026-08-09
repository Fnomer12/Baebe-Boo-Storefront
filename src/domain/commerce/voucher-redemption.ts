import { formatCedis } from "../money";

/**
 * Whether a gift voucher may be spent on this basket, and for how much.
 *
 * WHY THIS IS A MODULE
 * --------------------
 * The rule that matters here is a security rule, and it was wrong. The old
 * inline version in `src/lib/checkout/promotions.ts` only compared the
 * voucher's `recipient_email` against the shopper when `customerUserId` was
 * set — so a signed-in shopper was checked and an anonymous one was waved
 * through. A guest who knew (or guessed) a reserved voucher code could spend
 * someone else's balance, which is the one case the recipient field exists to
 * prevent.
 *
 * A voucher reserved for an address is spendable only by someone signed in as
 * that address. "Signed in" is the load-bearing part: this shop signs
 * customers in with a code emailed to the mailbox, so being signed in as an
 * address proves control of it, while a typed-in email at guest checkout
 * proves nothing.
 */

export type VoucherRecord = {
  balance: number;
  status: string;
  expiresAt: string | null;
  /** Lowercased by `create_gift_voucher`, but compared case-insensitively anyway. */
  recipientEmail: string | null;
};

export type VoucherRedemption = {
  credit: number;
  valid: boolean;
  message: string | null;
};

export function resolveVoucherRedemption(input: {
  /** Null when no voucher was offered, or the code matched nothing. */
  voucher: VoucherRecord | null;
  /** The signed-in shopper's verified address. Null for a guest. */
  redeemerEmail: string | null;
  merchandiseAfterDiscount: number;
  now: Date;
}): VoucherRedemption {
  const { voucher } = input;
  if (!voucher) {
    return { credit: 0, valid: false, message: "That gift voucher code is not valid." };
  }
  if (voucher.status === "cancelled") {
    return { credit: 0, valid: false, message: "This gift voucher has been cancelled." };
  }
  if (
    voucher.status === "expired" ||
    (voucher.expiresAt && new Date(voucher.expiresAt).getTime() <= input.now.getTime())
  ) {
    return { credit: 0, valid: false, message: "This gift voucher has expired." };
  }
  if (!(voucher.balance > 0)) {
    return { credit: 0, valid: false, message: "This gift voucher has no remaining balance." };
  }

  if (voucher.recipientEmail) {
    const reservedFor = voucher.recipientEmail.trim().toLowerCase();
    const redeemer = input.redeemerEmail?.trim().toLowerCase() ?? "";
    if (redeemer !== reservedFor) {
      return {
        credit: 0,
        valid: false,
        // Deliberately does not echo the reserved address back: the code is
        // enough to ask with, and it would leak whose voucher it is.
        message:
          "This gift voucher is reserved for a specific email address. Sign in with that address to spend it.",
      };
    }
  }

  if (!(input.merchandiseAfterDiscount > 0)) {
    return {
      credit: 0,
      valid: true,
      message: "Gift voucher applied (no merchandise balance to credit).",
    };
  }

  const credit = round(Math.min(voucher.balance, input.merchandiseAfterDiscount));
  return {
    credit,
    valid: true,
    message: `Gift voucher credit of ${formatCedis(credit)} applied.`,
  };
}

const round = (value: number) => Math.round(value * 100) / 100;
