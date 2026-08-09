import { NextResponse } from "next/server";
import { authorizeAdminApi } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authorization = await authorizeAdminApi("customers:write");
  if (!authorization.authorized) return authorization.response;

  const { id } = await params;

  const { data: voucher, error: lookupError } = await supabaseAdmin
    .from("gift_vouchers")
    .select("id, status")
    .eq("id", id)
    .maybeSingle();

  if (lookupError) {
    return NextResponse.json(
      { message: "Voucher could not be loaded." },
      { status: 500 },
    );
  }
  if (!voucher) {
    return NextResponse.json({ message: "Voucher not found." }, { status: 404 });
  }
  if (voucher.status !== "active") {
    return NextResponse.json(
      { message: "Only active vouchers can be cancelled." },
      { status: 409 },
    );
  }

  const { error } = await supabaseAdmin
    .from("gift_vouchers")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    return NextResponse.json(
      { message: "Voucher could not be cancelled." },
      { status: 500 },
    );
  }

  return NextResponse.json({ id, status: "cancelled" });
}
