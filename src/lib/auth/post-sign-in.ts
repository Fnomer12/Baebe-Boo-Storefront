import "server-only";

import { cookies } from "next/headers";
import { isSupabaseAdminConfigured, supabaseAdmin } from "@/lib/supabase-admin";
import type { createServerSupabaseClient } from "@/lib/supabase/server";

export type ServerSupabaseClient = Awaited<ReturnType<typeof createServerSupabaseClient>>;

/**
 * Work that must happen after a customer session is minted, whichever door they
 * came through — the emailed code or a magic link still in flight.
 *
 * Every step swallows its own failure. Sign-in has already succeeded by the time
 * this runs, so a follow-up error must not turn a valid session into a 500 with
 * no redirect.
 */
export async function completeCustomerSignIn(supabase: ServerSupabaseClient): Promise<void> {
  try {
    await supabase.rpc("claim_my_guest_orders");
  } catch {
    // Guest orders can be claimed again on the next sign-in.
  }

  try {
    await applyPendingReferral(supabase);
  } catch {
    // A missed referral attribution must never block the session.
  }
}

export async function applyPendingReferral(supabase: ServerSupabaseClient): Promise<void> {
  if (!isSupabaseAdminConfigured) return;

  const cookieStore = await cookies();
  const referralCode = cookieStore.get("referral_code")?.value;
  if (!referralCode) return;

  const { data: authData } = await supabase.auth.getUser();
  const userId = authData.user?.id;
  if (!userId) return;

  const { data: referral } = await supabaseAdmin
    .from("referrals")
    .select("id, referrer_user_id")
    .eq("code", referralCode)
    .is("referred_user_id", null)
    .eq("status", "invited")
    .maybeSingle();

  if (referral && referral.referrer_user_id !== userId) {
    await supabaseAdmin
      .from("referrals")
      .update({ referred_user_id: userId })
      .eq("id", referral.id);
  }

  cookieStore.set("referral_code", "", { maxAge: 0, path: "/" });
}
