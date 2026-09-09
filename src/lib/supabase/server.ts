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

export function createRouteHandlerSupabaseClient(
  request: Request,
  onCookiesToSet: (cookies: Array<{ name: string; value: string; options: Record<string, unknown> }>) => void,
) {
  const { url, key } = credentials();
  // Route handlers must attach cookies to the outgoing response directly.
  // Using `cookies()` from next/headers can be unreliable for fetch-based
  // Route Handler responses (NextResponse.json) – the browser never receives
  // the Set-Cookie header and the client stays stuck on "Checking your code…".
  const cookieHeader = request.headers.get("cookie") ?? "";
  const requestCookies = cookieHeader
    .split(";")
    .map((c) => c.trim())
    .filter(Boolean)
    .map((c) => {
      const eq = c.indexOf("=");
      return eq === -1
        ? { name: c, value: "" }
        : { name: c.slice(0, eq).trim(), value: decodeURIComponent(c.slice(eq + 1).trim()) };
    });

  return createServerClient(url, key, {
    cookies: {
      getAll: () => requestCookies,
      setAll: (cookiesToSet) => {
        onCookiesToSet(
          cookiesToSet.map(({ name, value, options }) => ({
            name,
            value,
            options: (options as Record<string, unknown>) ?? {},
          })),
        );
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
