import { NextResponse } from "next/server";
import { voucherCreateSchema } from "@/domain/commerce/promotion-schemas";
import { fieldErrors } from "@/lib/admin/schema-helpers";
import { authorizeAdminApi } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function GET() {
  const authorization = await authorizeAdminApi("customers:read");
  if (!authorization.authorized) return authorization.response;

  const { data: vouchers, error } = await supabaseAdmin
    .from("gift_vouchers")
    .select("id, code, initial_value, balance, recipient_email, status, expires_at, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json(
      { message: "Vouchers could not be loaded." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    // No `currency`: the column still exists and every row in it says GHS.
    // Sending it invited a reader to render "USD25" for a balance that
    // checkout would spend as 25 cedis.
    vouchers: (vouchers || []).map((voucher) => ({
      id: voucher.id,
      code: voucher.code,
      initialValue: voucher.initial_value,
      balance: voucher.balance,
      recipientEmail: voucher.recipient_email,
      status: voucher.status,
      expiresAt: voucher.expires_at,
      createdAt: voucher.created_at,
    })),
  });
}

export async function POST(request: Request) {
  const authorization = await authorizeAdminApi("customers:write");
  if (!authorization.authorized) return authorization.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = voucherCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        message: "Some details need fixing before this voucher can be issued.",
        errors: fieldErrors(parsed.error),
      },
      { status: 400 },
    );
  }

  const { data: voucherId, error } = await supabaseAdmin.rpc("create_gift_voucher", {
    p_initial_value: parsed.data.initialValue,
    // Hardcoded, and no longer accepted from the request. The admin form used
    // to offer a free-text currency box that checkout ignored entirely, so a
    // voucher saved as "USD" was still spent 1:1 against a cedi basket.
    p_currency: "GHS",
    p_recipient_email: parsed.data.recipientEmail || null,
    p_sender_user_id: authorization.admin.userId,
    p_message: parsed.data.message || null,
    p_expires_at: parsed.data.expiresAt || null,
  });

  if (error || !voucherId) {
    return NextResponse.json(
      { message: "Voucher could not be created." },
      { status: 500 },
    );
  }

  return NextResponse.json({ id: voucherId }, { status: 201 });
}
