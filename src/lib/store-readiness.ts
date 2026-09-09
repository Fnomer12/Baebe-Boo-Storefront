import "server-only";

import { isSupabaseAdminConfigured, supabaseAdmin } from "@/lib/supabase-admin";

export const STORE_NOT_READY_MESSAGE =
  "Our online store is still getting ready — checkout is paused while we finish setting up. Please check back soon.";

/**
 * Whether the online shop is live (BaebeAdmin → Products → "Store live").
 *
 * Fails open to `true`: a missing row, an unapplied migration, or an
 * unconfigured backend must never block real customers from paying.
 */
export async function isStoreReady(): Promise<boolean> {
  if (!isSupabaseAdminConfigured) return true;
  try {
    const { data, error } = await supabaseAdmin
      .from("site_settings")
      .select("value")
      .eq("key", "store_ready")
      .maybeSingle();
    if (error || !data) return true;
    return (data as { value: unknown }).value !== false;
  } catch {
    return true;
  }
}
