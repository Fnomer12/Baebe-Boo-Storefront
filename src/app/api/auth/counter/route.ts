import { NextResponse } from "next/server";
import { isSupabaseAdminConfigured, supabaseAdmin } from "@/lib/supabase-admin";

export async function POST(request: Request) {
  const authorization = request.headers.get("authorization");
  const accessToken = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];

  if (!accessToken) {
    return NextResponse.json({ authorized: false }, { status: 401 });
  }

  if (!isSupabaseAdminConfigured) {
    return NextResponse.json({ authorized: false }, { status: 503 });
  }

  const {
    data: { user },
    error: userError,
  } = await supabaseAdmin.auth.getUser(accessToken);
  const body = await request.json().catch(() => ({}));
  const staffCode = typeof body.staffCode === "string" ? body.staffCode.trim().toUpperCase() : "";

  if (userError || !user?.email || !staffCode) {
    return NextResponse.json({ authorized: false }, { status: 401 });
  }

  const { data: staffAuthorization, error: authorizationError } = await supabaseAdmin
    .from("staff_authorizations")
    .select("staff_id")
    .eq("email", user.email.toLowerCase())
    .eq("active", true)
    .maybeSingle();

  if (authorizationError || !staffAuthorization) {
    return NextResponse.json({ authorized: false }, { status: 403 });
  }

  const { data: staff, error: staffError } = await supabaseAdmin
    .from("shop_staff")
    .select(
      "id, staff_name, staff_code, shop_id, shops (id, name, location, database_name, is_active)"
    )
    .eq("id", staffAuthorization.staff_id)
    .eq("staff_code", staffCode)
    .maybeSingle();

  const shop = Array.isArray(staff?.shops) ? staff?.shops[0] : staff?.shops;

  if (staffError || !staff || !shop || !shop.is_active) {
    return NextResponse.json({ authorized: false }, { status: 403 });
  }

  return NextResponse.json({
    authorized: true,
    staff: {
      id: staff.id,
      name: staff.staff_name,
      code: staff.staff_code,
      shop,
    },
  });
}
