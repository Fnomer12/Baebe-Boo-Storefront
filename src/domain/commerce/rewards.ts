const POINTS_PER_CEDI = 100;
const MINIMUM_REDEMPTION_POINTS = 500;
const MAXIMUM_ORDER_SHARE = 0.2;

export function calculateEarnedPoints(paidMerchandiseTotal: number) {
  return Math.max(0, Math.floor(paidMerchandiseTotal));
}

export function calculateRedemption({
  points,
  orderSubtotal,
}: {
  points: number;
  orderSubtotal: number;
}) {
  const availablePoints = Math.max(0, Math.floor(points));
  if (availablePoints < MINIMUM_REDEMPTION_POINTS || orderSubtotal <= 0) {
    return { pointsUsed: 0, credit: 0 };
  }

  const maximumCredit = Math.floor(orderSubtotal * MAXIMUM_ORDER_SHARE * 100) / 100;
  const requestedCredit = Math.floor(availablePoints / POINTS_PER_CEDI);
  const credit = Math.min(maximumCredit, requestedCredit);
  const pointsUsed = Math.floor(credit * POINTS_PER_CEDI);

  return { pointsUsed, credit: pointsUsed / POINTS_PER_CEDI };
}
