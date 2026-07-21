import { createBrowserClient } from "@supabase/ssr";

const configuredUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabasePublishableKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (process.env.NODE_ENV === "production" && (!configuredUrl || !supabasePublishableKey)) {
  throw new Error("Supabase public credentials are not configured.");
}

// Local UI and browser tests can exercise the honest fallback catalog without
// a live Supabase project. Production never permits these placeholders.
const supabaseUrl = configuredUrl || "http://127.0.0.1:54321";
const browserKey = supabasePublishableKey || "local-development-publishable-key";

export const supabase = createBrowserClient(
  supabaseUrl,
  browserKey,
);
