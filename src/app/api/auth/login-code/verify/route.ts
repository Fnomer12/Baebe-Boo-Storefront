import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyLoginCode } from "@/lib/auth/login-code-service";
import { rateLimit } from "@/lib/rate-limit";

// No email here: the request id already binds the attempt to the browser that
// asked for the code, so an attacker cannot grind attempts against someone
// else's code without first guessing a 128-bit id.
const schema = z.object({
  requestId: z.uuid(),
  code: z.string().trim().regex(/^\d{6}$/),
});

export async function POST(request: Request) {
  const limit = rateLimit(request, "login-code:verify", 20, 10 * 60_000);
  if (!limit.allowed) {
    return NextResponse.json(
      { message: "Too many attempts. Please wait a moment." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: "Enter the 6-digit code from your email." }, { status: 400 });
  }

  const result = await verifyLoginCode(parsed.data.requestId, parsed.data.code);

  if (result.status === "verified") {
    return NextResponse.json({ redirectTo: "/account" });
  }
  if (result.status === "staff") {
    return NextResponse.json(
      { message: "This address signs in through the staff portal." },
      { status: 403 },
    );
  }
  if (result.status === "unavailable") {
    return NextResponse.json(
      { message: "Sign-in is temporarily unavailable. Please try again shortly." },
      { status: 503 },
    );
  }

  // One message for wrong, expired, already used, locked and unknown id.
  return NextResponse.json(
    {
      message: "That code is incorrect or has expired. Request a new one.",
      ...(result.attemptsRemaining !== undefined && { attemptsRemaining: result.attemptsRemaining }),
    },
    { status: 401 },
  );
}
