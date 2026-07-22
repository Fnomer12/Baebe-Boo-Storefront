import { createBrowserClient } from "@supabase/ssr";
import {
  isSupabaseConfigured,
  supabasePublicKey,
  supabaseUrl,
} from "@/lib/supabase-config";

export { isSupabaseConfigured } from "@/lib/supabase-config";

if (process.env.NODE_ENV === "production" && !isSupabaseConfigured) {
  throw new Error("Supabase public credentials are not configured.");
}

// Local UI and browser tests can exercise the honest fallback catalog without
// a live Supabase project. Production never permits these placeholders.
const browserUrl = supabaseUrl || "https://example.supabase.co";
const browserKey = supabasePublicKey || "local-development-publishable-key";

export const supabase = createBrowserClient(
  browserUrl,
  browserKey,
);
