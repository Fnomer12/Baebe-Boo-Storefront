export type PricedLine = {
  variantId: string;
  unitPrice: number;
  quantity: number;
};

export type Promotion = {
  id: string;
  kind: "percentage" | "fixed";
  value: number;
  stackable: boolean;
};

type QuoteOrderInput = {
  lines: PricedLine[];
  automaticPromotions: Promotion[];
  coupon?: Promotion;
  deliveryFee: number;
  rewardCredit: number;
};

type OrderQuote = {
  subtotal: number;
  discount: number;
  rewardCredit: number;
  deliveryFee: number;
  total: number;
  appliedPromotionIds: string[];
};

const money = (value: number) => Math.round(value * 100) / 100;

function promotionDiscount(promotion: Promotion, subtotal: number) {
  const raw =
    promotion.kind === "percentage"
      ? subtotal * (promotion.value / 100)
      : promotion.value;
  return money(Math.min(subtotal, Math.max(0, raw)));
}

export function quoteOrder(input: QuoteOrderInput): OrderQuote {
  const subtotal = money(
    input.lines.reduce(
      (total, line) =>
        total + Math.max(0, line.unitPrice) * Math.max(0, line.quantity),
      0,
    ),
  );
  const bestAutomatic = [...input.automaticPromotions].sort(
    (left, right) =>
      promotionDiscount(right, subtotal) - promotionDiscount(left, subtotal),
  )[0];
  const candidates = [bestAutomatic, input.coupon].filter(
    (promotion): promotion is Promotion => Boolean(promotion),
  );

  let applied: Promotion[];
  if (
    bestAutomatic &&
    input.coupon &&
    bestAutomatic.stackable &&
    input.coupon.stackable
  ) {
    applied = [bestAutomatic, input.coupon];
  } else {
    applied = candidates.sort(
      (left, right) =>
        promotionDiscount(right, subtotal) - promotionDiscount(left, subtotal),
    ).slice(0, 1);
  }

  const discount = money(
    Math.min(
      subtotal,
      applied.reduce(
        (total, promotion) => total + promotionDiscount(promotion, subtotal),
        0,
      ),
    ),
  );
  const merchandiseAfterDiscount = money(subtotal - discount);
  const rewardCredit = money(
    Math.min(merchandiseAfterDiscount, Math.max(0, input.rewardCredit)),
  );
  const deliveryFee = money(Math.max(0, input.deliveryFee));

  return {
    subtotal,
    discount,
    rewardCredit,
    deliveryFee,
    total: money(merchandiseAfterDiscount - rewardCredit + deliveryFee),
    appliedPromotionIds: applied.map((promotion) => promotion.id),
  };
}
