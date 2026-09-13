import { NextResponse } from "next/server";
import { authorizeCounterApi } from "@/lib/auth";
import { excludeStaffProfiles } from "@/lib/auth/staff-customers";
import { supabaseAdmin } from "@/lib/supabase-admin";

/**
 * Member lookup for the till: phone/email/name → account holder.
 *
 * The sale itself only accepts the returned `userId` UUID, never free text,
 * so a mistyped phone cannot attach loyalty to the wrong account.
 */
export async function GET(request: Request) {
  const authorization = await authorizeCounterApi();
  if (!authorization.authorized) return authorization.response;

  const { searchParams } = new URL(request.url);
  const query = (searchParams.get("q") || "").trim();
  if (query.length < 3) {
    return NextResponse.json({ customers: [] });
  }
  const term = query.replaceAll("%", "").slice(0, 64);
  const { data, error } = await supabaseAdmin
    .from("customer_profiles")
    .select("user_id, full_name, email, phone")
    .or(`email.ilike.%${term}%,phone.ilike.%${term}%,full_name.ilike.%${term}%`)
    .limit(8);
  if (error) {
    return NextResponse.json({ message: "Lookup failed." }, { status: 500 });
  }
  // Till logins have customer_profiles rows via the bootstrap trigger — a
  // cashier looking up their own name must not be able to attach the sale or
  // loyalty to a staff account.
  let staffUserIds = new Set<string>();
  try {
    const { data: staff } = await supabaseAdmin
      .from("shop_staff")
      .select("auth_user_id")
      .not("auth_user_id", "is", null);
    staffUserIds = new Set(
      (staff || []).map((row) => String((row as { auth_user_id: unknown }).auth_user_id || "")).filter(Boolean),
    );
  } catch {
    staffUserIds = new Set();
  }
  const visible = excludeStaffProfiles(
    (data || []).map((row) => ({
      user_id: String(row.user_id),
      email: (row.email as string | null) || null,
      full_name: row.full_name,
      phone: row.phone,
    })),
    staffUserIds,
  );
  return NextResponse.json({
    customers: visible.map((row) => ({
      userId: row.user_id,
      name: (row.full_name as string | null) || "Account holder",
      email: (row.email as string | null) || null,
      phone: (row.phone as string | null) || null,
    })),
  });
}
