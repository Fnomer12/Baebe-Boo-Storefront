import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";

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

  return { error: null, promotionError };
}
