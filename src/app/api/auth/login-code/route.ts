import { NextResponse } from "next/server";
import { z } from "zod";
import { requestLoginCode } from "@/lib/auth/login-code-service";
import { rateLimit } from "@/lib/rate-limit";

// Trim before validating: a pasted " a@b.com " should be accepted, not rejected.
const schema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
});

export async function POST(request: Request) {
  // Per-IP only. A per-email limit must never be visible in the response — it
  // would leak "somebody recently requested a code for this address".
  const limit = rateLimit(request, "login-code:request", 10, 10 * 60_000);
  if (!limit.allowed) {
    return NextResponse.json(
      { message: "Too many sign-in attempts. Please wait a moment." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: "Enter a valid email address." }, { status: 400 });
  }

  const requestIp =
    request.headers.get("x-real-ip")?.trim() ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    null;

  const result = await requestLoginCode(parsed.data.email, requestIp);
  if (result.status === "unavailable") {
    return NextResponse.json(
      { message: "Sign-in by email is temporarily unavailable. Please try again shortly." },
      { status: 503 },
    );
  }

  // "issued" and "suppressed" are deliberately indistinguishable to the caller.
  return NextResponse.json(
    {
      requestId: result.requestId,
      expiresInSeconds: result.expiresInSeconds,
      resendAfterSeconds: result.resendAfterSeconds,
    },
    { status: 202 },
  );
}
