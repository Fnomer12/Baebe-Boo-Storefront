import "server-only";

import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type AuthorizedCustomerMutation =
  | {
      authorized: true;
      supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>;
      userId: string;
    }
  | { authorized: false; response: NextResponse };

export async function authorizeCustomerMutation(
  request: Request,
  workflow: string,
  limit: number,
): Promise<AuthorizedCustomerMutation> {
  const requestOrigin = new URL(request.url).origin;
  if (request.headers.get("origin") !== requestOrigin) {
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

  const supabase = await createServerSupabaseClient();
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
