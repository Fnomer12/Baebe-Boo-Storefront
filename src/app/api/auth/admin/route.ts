import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

function allowedAdminEmails() {
  return new Set(
    (process.env.ADMIN_EMAILS || "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean)
  );
}

export async function POST(request: Request) {
  const authorization = request.headers.get("authorization");
  const accessToken = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];

  if (!accessToken) {
    return NextResponse.json({ authorized: false }, { status: 401 });
  }

  const {
    data: { user },
    error,
  } = await supabaseAdmin.auth.getUser(accessToken);

  if (error || !user?.email) {
    return NextResponse.json({ authorized: false }, { status: 401 });
  }

  const authorized = allowedAdminEmails().has(user.email.toLowerCase());

  return NextResponse.json(
    { authorized, email: user.email },
    { status: authorized ? 200 : 403 }
  );
}
