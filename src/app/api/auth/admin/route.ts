import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

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

  const { data: adminUser, error: adminError } = await supabaseAdmin
    .from("admin_users")
    .select("email, role, is_active")
    .ilike("email", user.email)
    .eq("role", "boss")
    .eq("is_active", true)
    .maybeSingle();

  const authorized = !adminError && Boolean(adminUser);

  return NextResponse.json(
    { authorized, email: user.email },
    { status: authorized ? 200 : 403 }
  );
}
