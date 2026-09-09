import { NextResponse } from "next/server";
import { authorizeCounterApi } from "@/lib/auth";
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
  return NextResponse.json({
    customers: (data || []).map((row) => ({
      userId: row.user_id,
      name: row.full_name || "Account holder",
      email: row.email || null,
      phone: row.phone || null,
    })),
  });
}
