import "server-only";

import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import {
  createServerSupabaseClient,
  tryCreateServerSupabaseClient,
} from "@/lib/supabase/server";

type AuthorizedCustomerMutation =
  | {
      authorized: true;
      supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>;
      userId: string;
    }
  | { authorized: false; response: NextResponse };

const FALLBACK_SITE_HOST = "baebe-boo.jtechinnovations.tech";

/** Host (including port when non-default) of the configured site URL. */
function configuredSiteHost(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!raw) return FALLBACK_SITE_HOST;
  try {
    const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
    return new URL(candidate).host.toLowerCase() || FALLBACK_SITE_HOST;
  } catch {
    return FALLBACK_SITE_HOST;
  }
}

/**
 * CSRF guard for cookie-authenticated mutations.
 *
 * `new URL(request.url).origin` is NOT the browser origin in production:
 * `next start --hostname 127.0.0.1 --port 3011` makes Next build `request.url`
 * from the bind address, so comparing the browser's
 * `https://baebe-boo.jtechinnovations.tech` against `https://127.0.0.1:3011`
 * rejected every customer mutation behind nginx. The browser Origin must be
 * checked against the proxied Host / X-Forwarded-Host instead, with
 * NEXT_PUBLIC_SITE_URL as a deployment-configured backstop.
 *
 * A missing Origin means a non-browser client (browsers always send it on
 * cross-origin POST/PATCH/DELETE), which carries no ambient-cookie CSRF risk —
 * allowed unless Sec-Fetch-Site says otherwise. `Origin: null` (sandboxed
 * iframe) fails `new URL` and is rejected.
 */
export function isTrustedMutationOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");

  if (origin === null) {
    const secFetchSite = request.headers.get("sec-fetch-site");
    return secFetchSite === null || secFetchSite.toLowerCase() === "same-origin";
  }

  let originHost: string;
  try {
    originHost = new URL(origin).host.toLowerCase();
  } catch {
    return false;
  }
  if (!originHost) return false;

  const requestHost = (
    request.headers.get("x-forwarded-host") ??
    request.headers.get("host") ??
    ""
  )
    .split(",")[0]
    .trim()
    .toLowerCase();

  return originHost === requestHost || originHost === configuredSiteHost();
}

export async function authorizeCustomerMutation(
  request: Request,
  workflow: string,
  limit: number,
): Promise<AuthorizedCustomerMutation> {
  if (!isTrustedMutationOrigin(request)) {
    return {
      authorized: false,
      response: NextResponse.json({ message: "Invalid request origin." }, { status: 403 }),
    };
  }

  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return {
      authorized: false,
      response: NextResponse.json({ message: "JSON content is required." }, { status: 415 }),
    };
  }

  const ipThrottle = rateLimit(request, `customer:${workflow}:ip`, limit * 2, 60_000);
  if (!ipThrottle.allowed) {
    return {
      authorized: false,
      response: NextResponse.json(
        { message: "Too many requests. Please wait a moment and try again." },
        { status: 429, headers: { "Retry-After": String(ipThrottle.retryAfter) } },
      ),
    };
  }

  const supabase = await tryCreateServerSupabaseClient();
  if (!supabase) {
    return {
      authorized: false,
      response: NextResponse.json(
        { message: "Account services are temporarily unavailable." },
        { status: 503 },
      ),
    };
  }
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user?.id) {
    return {
      authorized: false,
      response: NextResponse.json({ message: "Sign in to continue." }, { status: 401 }),
    };
  }

  const userThrottle = rateLimit(
    request,
    `customer:${workflow}:user:${user.id}`,
    limit,
    60_000,
  );
  if (!userThrottle.allowed) {
    return {
      authorized: false,
      response: NextResponse.json(
        { message: "Too many requests. Please wait a moment and try again." },
        { status: 429, headers: { "Retry-After": String(userThrottle.retryAfter) } },
      ),
    };
  }

  return { authorized: true, supabase, userId: user.id };
}
