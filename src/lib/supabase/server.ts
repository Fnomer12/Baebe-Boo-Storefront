import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

function credentials() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error("Supabase public credentials are not configured.");
  }

  return { url, key };
}

export async function createServerSupabaseClient() {
  const cookieStore = await cookies();
  const { url, key } = credentials();

  return createServerClient(url, key, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Server Components cannot write cookies. The proxy refreshes sessions.
        }
      },
    },
  });
}

export async function tryCreateServerSupabaseClient() {
  try {
    return await createServerSupabaseClient();
  } catch {
    return null;
  }
}
