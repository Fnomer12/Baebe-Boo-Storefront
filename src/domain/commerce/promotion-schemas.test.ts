import { describe, expect, it } from "vitest";
import { fieldErrors } from "@/lib/admin/schema-helpers";
import {
  mergePromotionPatch,
  promotionCreateSchema,
  promotionPatchSchema,
  promotionUpdateIssues,
  voucherCreateSchema,
  type StoredPromotion,
} from "./promotion-schemas";

const validPromotion = {
  name: "20% off everything",
  promotionType: "percentage",
  value: 20,
  status: "active",
  automatic: true,
};

describe("promotionCreateSchema", () => {
  // THE BUG: the client sent `""` for every untouched optional field and the
  // schema used `.optional()`, which admits `undefined` and not `""`. A
  // promotion with no code and no dates — the normal case — answered
  // "Invalid promotion details." So nothing could be created at all.
  it("accepts a promotion whose optional fields were left blank", () => {
    const result = promotionCreateSchema.safeParse({
      ...validPromotion,
      description: "",
      code: "",
      startsAt: "",
      endsAt: "",
      minimumOrderAmount: "",
      usageLimit: "",
      perCustomerLimit: "",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.code).toBeUndefined();
      expect(result.data.startsAt).toBeUndefined();
    }
  });

  // THE OTHER HALF OF THE SAME BUG: filling a date in failed too, because
  // <input type="datetime-local"> yields "2026-08-06T14:30" and
  // z.string().datetime() demands a full ISO instant.
  it("accepts the wall-clock value a datetime-local input actually produces", () => {
    const result = promotionCreateSchema.safeParse({
      ...validPromotion,
      startsAt: "2026-08-06T14:30",
      endsAt: "2026-09-06T14:30",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.startsAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    }
  });

  it("rejects a percentage over 100, which used to be allowed up to 1,000,000", () => {
    const result = promotionCreateSchema.safeParse({ ...validPromotion, value: 250 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(fieldErrors(result.error).value).toMatch(/between 0 and 100/i);
    }
  });

  it("rejects the promotion types checkout cannot run", () => {
    expect(
      promotionCreateSchema.safeParse({ ...validPromotion, promotionType: "fixed_price" }).success,
    ).toBe(false);
    expect(
      promotionCreateSchema.safeParse({ ...validPromotion, promotionType: "bundle" }).success,
    ).toBe(false);
  });

  it("stores no value for free delivery even when one is sent", () => {
    const result = promotionCreateSchema.safeParse({
      ...validPromotion,
      promotionType: "free_shipping",
      value: 500,
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.value).toBe(0);
  });

  it("refuses to activate a promotion no customer could ever reach", () => {
    const result = promotionCreateSchema.safeParse({
      ...validPromotion,
      automatic: false,
      code: "",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(fieldErrors(result.error).code).toMatch(/Apply automatically|code/i);
    }
  });

  // THE BUG: reachability only asked "automatic, or has a code?", so a
  // promotion whose end date had already passed could be created as Active. It
  // then sat in the table looking healthy while checkout answered "This
  // promotion has expired." to every basket that tried it.
  it("refuses to activate a promotion whose end date has already gone by", () => {
    const result = promotionCreateSchema.safeParse({
      ...validPromotion,
      endsAt: "2020-01-01T00:00:00.000Z",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(fieldErrors(result.error).endsAt).toMatch(/already passed/i);
    }
  });

  it("still accepts an end date in the future", () => {
    expect(
      promotionCreateSchema.safeParse({ ...validPromotion, endsAt: "2099-01-01T00:00:00.000Z" })
        .success,
    ).toBe(true);
  });

  it("lets a past end date through on a draft, which is not live yet", () => {
    expect(
      promotionCreateSchema.safeParse({
        ...validPromotion,
        status: "draft",
        endsAt: "2020-01-01T00:00:00.000Z",
      }).success,
    ).toBe(true);
  });

  it("lets an unreachable promotion be saved as a draft", () => {
    expect(
      promotionCreateSchema.safeParse({
        ...validPromotion,
        status: "draft",
        automatic: false,
        code: "",
      }).success,
    ).toBe(true);
  });

  it("rejects an end date before the start date, matching the table CHECK", () => {
    const result = promotionCreateSchema.safeParse({
      ...validPromotion,
      startsAt: "2026-09-06T14:30",
      endsAt: "2026-08-06T14:30",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(fieldErrors(result.error).endsAt).toMatch(/after the start date/i);
    }
  });

  it("rejects a discount of zero rather than saving a promotion that takes nothing off", () => {
    const result = promotionCreateSchema.safeParse({ ...validPromotion, value: 0 });
    expect(result.success).toBe(false);
    if (!result.success) expect(fieldErrors(result.error).value).toMatch(/takes nothing off/i);
  });

  it("rejects a product listed as both included and excluded", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    const result = promotionCreateSchema.safeParse({
      ...validPromotion,
      productIds: [id],
      excludedProductIds: [id],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(fieldErrors(result.error).excludedProductIds).toMatch(/both included and excluded/i);
    }
  });

  it("names the field that is wrong instead of one generic message", () => {
    const result = promotionCreateSchema.safeParse({ ...validPromotion, name: "   " });
    expect(result.success).toBe(false);
    if (!result.success) expect(fieldErrors(result.error).name).toMatch(/name/i);
  });
});

describe("promotionPatchSchema", () => {
  it("treats an absent field as 'leave it alone' and a blank one as 'clear it'", () => {
    const untouched = promotionPatchSchema.parse({ status: "paused" });
    expect("endsAt" in untouched).toBe(false);

    const cleared = promotionPatchSchema.parse({ endsAt: "", code: "  " });
    expect(cleared.endsAt).toBeNull();
    expect(cleared.code).toBeNull();
  });

  it("accepts a status-only patch, so pausing does not require refilling the form", () => {
    expect(promotionPatchSchema.safeParse({ status: "paused" }).success).toBe(true);
  });

  it("still bounds a percentage when both type and value are being changed", () => {
    expect(
      promotionPatchSchema.safeParse({ promotionType: "percentage", value: 250 }).success,
    ).toBe(false);
  });
});

describe("mergePromotionPatch", () => {
  const stored: StoredPromotion = {
    promotionType: "percentage",
    value: 20,
    status: "active",
    automatic: true,
    startsAt: "2026-08-01T00:00:00.000Z",
    endsAt: "2026-09-01T00:00:00.000Z",
    code: "SUMMER26",
  };

  it("leaves absent fields alone and clears the ones sent as null", () => {
    expect(mergePromotionPatch(stored, promotionPatchSchema.parse({ status: "paused" }))).toEqual({
      ...stored,
      status: "paused",
    });
    expect(mergePromotionPatch(stored, promotionPatchSchema.parse({ endsAt: "", code: "" }))).toEqual({
      ...stored,
      endsAt: null,
      code: null,
    });
  });

  it("drops the cash value when a promotion becomes free delivery", () => {
    expect(
      mergePromotionPatch(stored, promotionPatchSchema.parse({ promotionType: "free_shipping" })).value,
    ).toBe(0);
  });
});

describe("promotionUpdateIssues", () => {
  const stored: StoredPromotion = {
    promotionType: "percentage",
    value: 20,
    status: "paused",
    automatic: false,
    startsAt: null,
    endsAt: null,
    code: null,
  };

  it("blocks switching on a promotion no customer could reach", () => {
    const issues = promotionUpdateIssues(stored, promotionPatchSchema.parse({ status: "active" }));
    expect(issues.code).toMatch(/Apply automatically|code/i);
  });

  it("allows switching it on once it is automatic", () => {
    expect(
      promotionUpdateIssues(
        stored,
        promotionPatchSchema.parse({ status: "active", automatic: true }),
      ),
    ).toEqual({});
  });

  // A promotion saved before these rules existed must still be pausable —
  // otherwise the only way to stop a broken offer is to fix it first.
  it("does not hold an untouched field against a patch that never mentions it", () => {
    const legacy: StoredPromotion = { ...stored, promotionType: "bundle", value: 0 };
    expect(promotionUpdateIssues(legacy, promotionPatchSchema.parse({ name: "Renamed" }))).toEqual({});
  });

  // Activating one of these puts "This promotion type is not available
  // online." in front of a customer at checkout.
  it("refuses to switch on a promotion type checkout cannot run", () => {
    const legacy: StoredPromotion = { ...stored, promotionType: "fixed_price", automatic: true };
    const issues = promotionUpdateIssues(legacy, promotionPatchSchema.parse({ status: "active" }));
    expect(issues.promotionType).toMatch(/cannot run this promotion type/i);
  });

  it("still lets an old promotion be paused or converted to a type that works", () => {
    const legacy: StoredPromotion = { ...stored, promotionType: "fixed_price", automatic: true };
    expect(promotionUpdateIssues(legacy, promotionPatchSchema.parse({ status: "paused" }))).toEqual({});
    expect(
      promotionUpdateIssues(
        legacy,
        promotionPatchSchema.parse({ status: "active", promotionType: "free_shipping" }),
      ),
    ).toEqual({});
  });

  it("checks the merged row, not the patch, when only one date is being changed", () => {
    const dated: StoredPromotion = { ...stored, startsAt: "2026-09-01T00:00:00.000Z" };
    const issues = promotionUpdateIssues(
      dated,
      promotionPatchSchema.parse({ endsAt: "2026-08-01T00:00" }),
    );
    expect(issues.endsAt).toMatch(/after the start date/i);
  });

  // The same bug from the patch side: an admin switching a finished campaign
  // back on got a green "Active" row that no basket could ever match.
  it("refuses to switch on a promotion that has already finished", () => {
    const finished: StoredPromotion = {
      ...stored,
      automatic: true,
      endsAt: "2020-01-01T00:00:00.000Z",
    };
    const issues = promotionUpdateIssues(finished, promotionPatchSchema.parse({ status: "active" }));
    expect(issues.endsAt).toMatch(/already passed/i);
  });

  it("refuses to move a live promotion's end date into the past", () => {
    const live: StoredPromotion = { ...stored, status: "active", automatic: true };
    const issues = promotionUpdateIssues(
      live,
      promotionPatchSchema.parse({ endsAt: "2020-01-01T00:00:00.000Z" }),
    );
    expect(issues.endsAt).toMatch(/already passed/i);
  });

  it("lets a finished promotion be switched on once its end date is moved out", () => {
    const finished: StoredPromotion = {
      ...stored,
      automatic: true,
      endsAt: "2020-01-01T00:00:00.000Z",
    };
    expect(
      promotionUpdateIssues(
        finished,
        promotionPatchSchema.parse({ status: "active", endsAt: "2099-01-01T00:00:00.000Z" }),
      ),
    ).toEqual({});
    // Clearing the end date entirely works too.
    expect(
      promotionUpdateIssues(
        finished,
        promotionPatchSchema.parse({ status: "active", endsAt: "" }),
      ),
    ).toEqual({});
  });

  it("does not hold a past end date against a promotion being paused", () => {
    const finished: StoredPromotion = {
      ...stored,
      automatic: true,
      status: "active",
      endsAt: "2020-01-01T00:00:00.000Z",
    };
    expect(
      promotionUpdateIssues(finished, promotionPatchSchema.parse({ status: "paused" })),
    ).toEqual({});
  });

  it("bounds a percentage when only the amount is being changed", () => {
    expect(promotionUpdateIssues(stored, promotionPatchSchema.parse({ value: 250 })).value).toMatch(
      /between 0 and 100/i,
    );
  });
});

describe("voucherCreateSchema", () => {
  // THE BUG: `recipientEmail: ""` from an untouched field failed `.email()`,
  // so an open voucher — the normal case — could not be created.
  it("accepts a voucher with no recipient and no expiry", () => {
    const result = voucherCreateSchema.safeParse({
      initialValue: 100,
      recipientEmail: "",
      message: "",
      expiresAt: "",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.recipientEmail).toBeUndefined();
  });

  it("has no currency field at all", () => {
    const result = voucherCreateSchema.safeParse({ initialValue: 100, currency: "USD" });
    expect(result.success).toBe(true);
    if (result.success) expect("currency" in result.data).toBe(false);
  });

  it("accepts the wall-clock expiry a datetime-local input produces", () => {
    const result = voucherCreateSchema.safeParse({
      initialValue: 100,
      expiresAt: "2099-12-24T18:00",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an expiry that has already passed", () => {
    const result = voucherCreateSchema.safeParse({
      initialValue: 100,
      expiresAt: "2020-01-01T00:00",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(fieldErrors(result.error).expiresAt).toMatch(/already passed/i);
    }
  });

  it("rejects a voucher worth nothing", () => {
    expect(voucherCreateSchema.safeParse({ initialValue: 0 }).success).toBe(false);
  });
});
