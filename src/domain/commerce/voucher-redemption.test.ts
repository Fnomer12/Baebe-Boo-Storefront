import { describe, expect, it } from "vitest";
import { resolveVoucherRedemption } from "./voucher-redemption";

const now = new Date("2026-08-06T12:00:00.000Z");

const openVoucher = {
  balance: 100,
  status: "active",
  expiresAt: "2026-12-01T00:00:00.000Z",
  recipientEmail: null,
};

const reservedVoucher = { ...openVoucher, recipientEmail: "ama@example.com" };

describe("resolveVoucherRedemption", () => {
  it("credits an open voucher up to the merchandise balance", () => {
    expect(
      resolveVoucherRedemption({
        voucher: openVoucher,
        redeemerEmail: null,
        merchandiseAfterDiscount: 250,
        now,
      }),
    ).toEqual({ credit: 100, valid: true, message: "Gift voucher credit of GH₵100.00 applied." });
  });

  it("never credits more than the basket is worth", () => {
    expect(
      resolveVoucherRedemption({
        voucher: openVoucher,
        redeemerEmail: null,
        merchandiseAfterDiscount: 40,
        now,
      }).credit,
    ).toBe(40);
  });

  // THE BUG: the recipient check only ran when `customerUserId` was set, so a
  // signed-in shopper was verified and an anonymous one was waved straight
  // through. Anyone with the code could spend a reserved voucher by checking
  // out as a guest.
  it("refuses a reserved voucher at anonymous checkout", () => {
    expect(
      resolveVoucherRedemption({
        voucher: reservedVoucher,
        redeemerEmail: null,
        merchandiseAfterDiscount: 250,
        now,
      }),
    ).toEqual({
      credit: 0,
      valid: false,
      message:
        "This gift voucher is reserved for a specific email address. Sign in with that address to spend it.",
    });
  });

  it("refuses a reserved voucher for a signed-in shopper with a different address", () => {
    expect(
      resolveVoucherRedemption({
        voucher: reservedVoucher,
        redeemerEmail: "kofi@example.com",
        merchandiseAfterDiscount: 250,
        now,
      }).valid,
    ).toBe(false);
  });

  it("allows the recipient, ignoring case and stray whitespace", () => {
    expect(
      resolveVoucherRedemption({
        voucher: reservedVoucher,
        redeemerEmail: "  Ama@Example.com ",
        merchandiseAfterDiscount: 250,
        now,
      }).credit,
    ).toBe(100);
  });

  it("does not name the person a voucher is reserved for", () => {
    const refusal = resolveVoucherRedemption({
      voucher: reservedVoucher,
      redeemerEmail: null,
      merchandiseAfterDiscount: 250,
      now,
    });
    expect(refusal.message).not.toContain("ama@example.com");
  });

  it("reports cancelled, expired, spent and unknown vouchers distinctly", () => {
    expect(
      resolveVoucherRedemption({
        voucher: null,
        redeemerEmail: null,
        merchandiseAfterDiscount: 250,
        now,
      }).message,
    ).toBe("That gift voucher code is not valid.");

    expect(
      resolveVoucherRedemption({
        voucher: { ...openVoucher, status: "cancelled" },
        redeemerEmail: null,
        merchandiseAfterDiscount: 250,
        now,
      }).message,
    ).toBe("This gift voucher has been cancelled.");

    expect(
      resolveVoucherRedemption({
        voucher: { ...openVoucher, expiresAt: "2026-08-01T00:00:00.000Z" },
        redeemerEmail: null,
        merchandiseAfterDiscount: 250,
        now,
      }).message,
    ).toBe("This gift voucher has expired.");

    expect(
      resolveVoucherRedemption({
        voucher: { ...openVoucher, balance: 0 },
        redeemerEmail: null,
        merchandiseAfterDiscount: 250,
        now,
      }).message,
    ).toBe("This gift voucher has no remaining balance.");
  });

  it("stays valid but credits nothing when the discount already cleared the basket", () => {
    expect(
      resolveVoucherRedemption({
        voucher: openVoucher,
        redeemerEmail: null,
        merchandiseAfterDiscount: 0,
        now,
      }),
    ).toEqual({
      credit: 0,
      valid: true,
      message: "Gift voucher applied (no merchandise balance to credit).",
    });
  });

  it("checks the reservation before it checks the basket, so a stranger learns nothing", () => {
    expect(
      resolveVoucherRedemption({
        voucher: reservedVoucher,
        redeemerEmail: null,
        merchandiseAfterDiscount: 0,
        now,
      }).valid,
    ).toBe(false);
  });
});
