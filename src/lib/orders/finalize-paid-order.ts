import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";
import { sendOrderConfirmation } from "@/lib/orders/order-confirmation";
import { refreshProfitReports } from "@/lib/admin/refresh-reports";

export async function finalizeVerifiedOrder(orderId: string, providerReference: string) {
  const { data: reservation, error: reservationLookupError } = await supabaseAdmin
    .from("inventory_reservations")
    .select("id, status")
    .eq("order_id", orderId)
    .maybeSingle();

  if (reservationLookupError) return { error: reservationLookupError };

  const result = reservation
    ? await supabaseAdmin.rpc("finalize_checkout_reservation", {
        p_reservation_id: reservation.id,
        p_order_id: orderId,
      })
    : await supabaseAdmin.rpc("finalize_paid_order", { p_order_id: orderId });

  if (result.error) return { error: result.error };

  await supabaseAdmin
    .from("payment_attempts")
    .update({ status: "paid", verified_at: new Date().toISOString() })
    .eq("provider_reference", providerReference);

  // Promotion bookkeeping must never strand a paid order. The database RPC is
  // idempotent, so verification and webhook retries safely converge.
  const { error: promotionError } = await supabaseAdmin.rpc(
    "record_order_promotion_redemptions",
    { p_order_id: orderId },
  );

  const voucherError = await redeemOrderVoucher(orderId);
  const referralError = await creditReferralReward(orderId);

  // The receipt is the last thing to happen and the least important. It claims
  // its own send inside Postgres, so the browser's /verify call and Paystack's
  // webhook racing here still produce exactly one email — and a failure is
  // reported, never thrown, because a paid order must not be undone by a
  // struggling email provider.
  const confirmation = await sendOrderConfirmation(orderId);

  // Both callers — /api/paystack/verify and /api/paystack/webhook — discard
  // this outcome, so until now a customer who never received their receipt was
  // completely invisible. Logged here rather than in the two routes: one site
  // covers both, beside the identical precedent for the report refresh below.
  if (confirmation.status === "failed") {
    console.error("finalizeVerifiedOrder: order confirmation failed", {
      orderId,
      reason: confirmation.reason,
    });
  } else if (confirmation.status === "sent" && confirmation.attachmentFailed) {
    console.error("finalizeVerifiedOrder: receipt sent without its PDF", {
      orderId,
      reason: confirmation.attachmentFailed,
    });
  } else if (confirmation.status === "sent" && confirmation.simulated) {
    // Production runs EMAIL_PROVIDER=resend. A simulated send here means a
    // misconfigured deployment silently swallowing every receipt.
    console.error("finalizeVerifiedOrder: receipt was simulated, not delivered", {
      orderId,
    });
  }
  if (confirmation.status === "sent" && confirmation.smsError) {
    console.error("finalizeVerifiedOrder: order SMS notification failed", {
      orderId,
      reason: confirmation.smsError,
    });
  }

  // The order is now paid and counted in `orders`, but the profit report reads
  // a materialized snapshot — without this the dashboard reports revenue the
  // KPI tiles already show, as GH₵0. Logged rather than returned: the caller
  // has no action to take, and a stale report must not colour the result of a
  // paid order.
  const { error: reportError } = await refreshProfitReports();
  if (reportError) {
    console.error("finalizeVerifiedOrder: profit report refresh failed", reportError);
  }

  return { error: null, promotionError, voucherError, referralError, confirmation };
}

async function creditReferralReward(orderId: string) {
  const { data: order, error } = await supabaseAdmin
    .from("orders")
    .select("customer_user_id")
    .eq("id", orderId)
    .maybeSingle();

  if (error || !order?.customer_user_id) return null;

  const { data: referral } = await supabaseAdmin
    .from("referrals")
    .select("id, referrer_user_id")
    .eq("referred_user_id", order.customer_user_id)
    .eq("status", "invited")
    .maybeSingle();

  if (!referral) return null;

  const { error: creditError } = await supabaseAdmin.rpc("credit_loyalty_points", {
    p_user_id: referral.referrer_user_id,
    p_event_type: "referral",
    p_source_key: `referral:${referral.id}:qualified`,
    p_reason: "Referral completed their first purchase",
    p_order_id: orderId,
    p_metadata: { referred_user_id: order.customer_user_id },
  });

  if (!creditError) {
    await supabaseAdmin
      .from("referrals")
      .update({ status: "qualified", qualified_at: new Date().toISOString(), qualifying_order_id: orderId })
      .eq("id", referral.id);
  }

  return creditError;
}

/**
 * Spend the voucher this order was already given credit for.
 *
 * THE BUG THIS FIXES
 * ------------------
 * This used to bail out whenever `customer_user_id` was null — which is every
 * guest checkout. The credit had already come off `orders.total_amount`, so the
 * shop was paid less, but `gift_vouchers.balance` was never decremented and no
 * `voucher_redemptions` row was written. The same voucher could then be spent
 * again, and again, for ever.
 *
 * Passing the null through is safe and is the whole fix: the only thing
 * `redeem_voucher` does with the user id is prove ownership of a voucher
 * reserved for an email address, and a null matches no row in `auth.users` — so
 * a reserved voucher is still refused at guest checkout (checkout has already
 * refused to credit one), while an open voucher is properly deducted.
 */
async function redeemOrderVoucher(orderId: string) {
  const { data: order, error } = await supabaseAdmin
    .from("orders")
    .select("customer_user_id, voucher_code, voucher_credit")
    .eq("id", orderId)
    .maybeSingle();

  if (error || !order || !order.voucher_code || !(Number(order.voucher_credit) > 0)) {
    return null;
  }

  const { error: redeemError } = await supabaseAdmin.rpc("redeem_voucher", {
    p_code: order.voucher_code,
    p_user_id: order.customer_user_id ?? null,
    p_order_id: orderId,
    p_amount: order.voucher_credit,
  });

  if (!redeemError) return null;

  // `voucher_redemptions` is unique on (voucher_id, order_id) and the RPC
  // refuses a second redemption for the same order, so the browser's /verify
  // call and Paystack's webhook racing here deduct exactly once. That refusal
  // is this retry converging, not a failure, and reporting it would make every
  // second call look broken.
  if (isAlreadyRedeemedForThisOrder(redeemError)) return null;

  // …but the RPC checks the BALANCE before it checks this order
  // (20260727_loyalty_vouchers.sql:163-174). So when the order spent the
  // voucher's whole balance — the ordinary case for a gift voucher — the
  // second racing call trips "Voucher has no remaining balance" instead, and
  // the message-matching above never sees it. Money was always safe here (the
  // insert simply never happens), but the retry was reported as a bookkeeping
  // failure. Settle it by asking what actually got written.
  if (isVoucherExhausted(redeemError) && (await voucherAlreadyRecordedFor(orderId))) {
    return null;
  }

  return redeemError;
}

const isAlreadyRedeemedForThisOrder = (error: { message?: string | null }) =>
  typeof error.message === "string" &&
  error.message.toLowerCase().includes("already redeemed for this order");

const isVoucherExhausted = (error: { message?: string | null }) =>
  typeof error.message === "string" &&
  error.message.toLowerCase().includes("no remaining balance");

/** Did a redemption for this order land, whatever the RPC just said? */
async function voucherAlreadyRecordedFor(orderId: string) {
  const { data, error } = await supabaseAdmin
    .from("voucher_redemptions")
    .select("id")
    .eq("order_id", orderId)
    .limit(1);
  // On a read failure, report the original redemption error rather than
  // silently swallowing it — an unexplained failure is better than a wrong
  // reassurance.
  if (error) return false;
  return (data?.length ?? 0) > 0;
}
