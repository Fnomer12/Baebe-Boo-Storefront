import { describe, expect, it } from "vitest";
import {
  describePromotion,
  presetForPromotionType,
  promotionPresets,
  promotionReachWarning,
  toPromotionPayload,
  type PromotionDraft,
} from "./promotion-presets";

const baseDraft: PromotionDraft = {
  preset: "percent_off",
  name: "  20% off everything  ",
  amount: 20,
  automatic: true,
  stackable: false,
  status: "active",
};

describe("toPromotionPayload", () => {
  it("turns 'percent off' into a percentage promotion", () => {
    expect(toPromotionPayload(baseDraft)).toMatchObject({
      name: "20% off everything",
      promotionType: "percentage",
      value: 20,
      status: "active",
      automatic: true,
    });
  });

  it("turns 'amount off' into a fixed_amount promotion in cedis", () => {
    expect(
      toPromotionPayload({ ...baseDraft, preset: "amount_off", amount: 50 }),
    ).toMatchObject({ promotionType: "fixed_amount", value: 50 });
  });

  // Bug: free_shipping shared the "Value" box with the discount types, so a
  // number left over from switching type became a cash discount on a promotion
  // labelled "free delivery".
  it("stores no value at all for free delivery, whatever the amount box held", () => {
    expect(
      toPromotionPayload({ ...baseDraft, preset: "free_delivery", amount: 500 }),
    ).toMatchObject({ promotionType: "free_shipping", value: 0 });
  });

  it("uppercases the code and drops blank optional fields", () => {
    const payload = toPromotionPayload({
      ...baseDraft,
      code: " summer26 ",
      description: "   ",
      startsAt: "",
    });
    expect(payload.code).toBe("SUMMER26");
    expect(payload.description).toBeUndefined();
    expect(payload.startsAt).toBeUndefined();
  });

  it("always sends both targeting lists so a cleared selection is not read as 'unchanged'", () => {
    expect(toPromotionPayload(baseDraft)).toMatchObject({
      productIds: [],
      excludedProductIds: [],
    });
  });
});

describe("describePromotion", () => {
  it("reads the offer back the way a customer would hear it", () => {
    expect(describePromotion({ preset: "percent_off", amount: 20 })).toBe(
      "20% off every order.",
    );
    expect(
      describePromotion({ preset: "percent_off", amount: 20, minimumOrderAmount: 200 }),
    ).toBe("20% off orders over GH₵200.00.");
    expect(describePromotion({ preset: "amount_off", amount: 50 })).toBe(
      "GH₵50.00 off every order.",
    );
    expect(
      describePromotion({ preset: "free_delivery", minimumOrderAmount: 200 }),
    ).toBe("Free delivery on orders over GH₵200.00.");
  });

  it("does not force decimals onto a percentage", () => {
    expect(describePromotion({ preset: "percent_off", amount: 12.5 })).toBe(
      "12.5% off every order.",
    );
  });
});

describe("promotionReachWarning", () => {
  // Bug: a promotion that is neither automatic nor coded can never be applied
  // by anyone, yet it saved and displayed as active.
  it("warns when a promotion has no way of reaching a basket", () => {
    expect(promotionReachWarning({ automatic: false })).toMatch(/switch on/i);
    expect(promotionReachWarning({ automatic: false, code: "   " })).toMatch(/code/i);
  });

  it("stays quiet when the promotion is automatic or has a code", () => {
    expect(promotionReachWarning({ automatic: true })).toBeNull();
    expect(promotionReachWarning({ automatic: false, code: "SUMMER26" })).toBeNull();
  });
});

describe("presetForPromotionType", () => {
  it("maps each supported type back to the preset that edits it", () => {
    expect(presetForPromotionType("percentage")).toBe("percent_off");
    expect(presetForPromotionType("fixed_amount")).toBe("amount_off");
    expect(presetForPromotionType("free_shipping")).toBe("free_delivery");
  });

  // fixed_price and bundle were creatable and had no checkout implementation.
  // They are gone from the UI, so an old row must not open as an editable
  // preset that would quietly change what it does.
  it("refuses to map the promotion types checkout cannot run", () => {
    expect(presetForPromotionType("fixed_price")).toBeNull();
    expect(presetForPromotionType("bundle")).toBeNull();
  });
});

describe("promotionPresets", () => {
  it("offers only types checkout can honour", () => {
    expect(promotionPresets.map((preset) => preset.promotionType)).toEqual([
      "percentage",
      "fixed_amount",
      "free_shipping",
    ]);
  });
});
