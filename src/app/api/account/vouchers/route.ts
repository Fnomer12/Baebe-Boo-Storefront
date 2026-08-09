import { NextResponse } from "next/server";
import { tryCreateServerSupabaseClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await tryCreateServerSupabaseClient();
  if (!supabase) {
    return NextResponse.json(
      { message: "Account services are temporarily unavailable." },
      { status: 503 },
    );
  }

  // No origin check: same-origin GETs carry no Origin header, so the previous
  // check rejected every request, and a read gated by the session cookie has
  // no CSRF surface anyway.
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user?.id) {
    return NextResponse.json({ message: "Sign in to continue." }, { status: 401 });
  }

  const voucherFilter = user.email
    ? `sender_user_id.eq.${user.id},recipient_email.eq.${user.email}`
    : `sender_user_id.eq.${user.id}`;
  const { data: vouchers, error: vouchersError } = await supabase
    .from("gift_vouchers")
    .select("id, code, initial_value, balance, currency, status, recipient_email, expires_at, created_at")
    .or(voucherFilter)
    .order("created_at", { ascending: false });

  if (vouchersError) {
    return NextResponse.json(
      { message: "Vouchers could not be loaded." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    vouchers: (vouchers || []).map((voucher) => ({
      id: voucher.id,
      code: voucher.code,
      initialValue: voucher.initial_value,
      balance: voucher.balance,
      currency: voucher.currency,
      recipientEmail: voucher.recipient_email,
      status: voucher.status,
      expiresAt: voucher.expires_at,
      createdAt: voucher.created_at,
    })),
  });
}
