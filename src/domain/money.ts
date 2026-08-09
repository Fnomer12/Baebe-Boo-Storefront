/**
 * The one way this codebase renders money.
 *
 * Baebe Boo sells in Ghana, in cedis, only. There is no currency selector
 * anywhere in the product and there is not meant to be one: `orders` has no
 * currency column, Paystack is initialised with a hardcoded `"GHS"` and both
 * the verify and webhook handlers reject anything else. The single place a
 * currency could ever be *chosen* was a free-text box on the voucher form,
 * which accepted "cedis" and "$" and which checkout ignored anyway — a `USD`
 * voucher was credited 1:1 against a cedi basket. That box is gone.
 *
 * So `formatCedis` takes no currency argument, and nothing that calls it
 * should accept one either. Adding the parameter back is how the drift starts.
 *
 * Before this module there were eight incompatible implementations — some
 * `en-GH`, some `en-GB`, some with two decimals, some with none — plus a dozen
 * raw `GH₵${value}` template literals. That is why 25 rendered as "GH₵25" on
 * the dashboard, "GH₵25.00" on a receipt and "GH₵25" again in the cart.
 *
 * Two decimals, always. A price is a price on a dashboard and it is a promise
 * on a receipt a customer is handed; the receipt sets the bar.
 */
export function formatCedis(amount: number): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  return `GH₵${safe.toLocaleString("en-GH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * A price range, for a product whose versions are not all the same price.
 *
 * Collapses to a single price when the range is empty, so callers never have
 * to special-case "from GH₵20.00 to GH₵20.00".
 */
export function formatCedisRange(from: number, to: number): string {
  if (!Number.isFinite(from) || !Number.isFinite(to) || from === to) {
    return formatCedis(from);
  }
  return `From ${formatCedis(Math.min(from, to))}`;
}
