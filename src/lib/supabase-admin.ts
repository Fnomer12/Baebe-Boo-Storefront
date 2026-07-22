import "server-only";

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;

export const isSupabaseAdminConfigured = Boolean(supabaseUrl && supabaseSecretKey);

// Keep module evaluation safe so routes can return a controlled 503 when a
// deployment is not configured yet. Callers must check the flag before use.
export const supabaseAdmin = createClient(
  supabaseUrl || "https://example.supabase.co",
  supabaseSecretKey || "supabase-not-configured",
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  },
);
