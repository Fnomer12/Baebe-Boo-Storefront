import { NextResponse } from "next/server";
import { authorizeCustomerMutation } from "@/lib/account/customer-api";
import { createServerSupabaseClient } from "@/lib/supabase/server";

function generateReferralCode(): string {
  return `BB${crypto.randomUUID().replaceAll("-", "").slice(0, 6).toUpperCase()}`;
}

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) {
      return NextResponse.json({ referrals: [], code: null }, { status: 401 });
    }

    const [referralsResult, codeResult] = await Promise.all([
      supabase
        .from("referrals")
        .select("id, code, status, created_at, qualified_at, rewarded_at, referred_user_id")
        .eq("referrer_user_id", authData.user.id)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("referrals")
        .select("code")
        .eq("referrer_user_id", authData.user.id)
        .is("referred_user_id", null)
        .eq("status", "invited")
        .order("created_at", { ascending: false })
        .maybeSingle(),
    ]);

    return NextResponse.json({
      referrals: referralsResult.data ?? [],
      code: codeResult.data?.code ?? null,
    });
  } catch {
    return NextResponse.json({ referrals: [], code: null }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const authorization = await authorizeCustomerMutation(request, "referral-create", 6);
  if (!authorization.authorized) return authorization.response;

  const { supabase, userId } = authorization;

  const existing = await supabase
    .from("referrals")
    .select("code")
    .eq("referrer_user_id", userId)
    .is("referred_user_id", null)
    .eq("status", "invited")
    .order("created_at", { ascending: false })
    .maybeSingle();

  if (existing.data?.code) {
    return NextResponse.json({ code: existing.data.code });
  }

  let code = generateReferralCode();
  let attempts = 0;
  while (attempts < 5) {
    const { data, error } = await supabase
      .from("referrals")
      .insert({ referrer_user_id: userId, code, status: "invited" })
      .select("code")
      .single();
    if (!error && data) {
      return NextResponse.json({ code: data.code }, { status: 201 });
    }
    code = generateReferralCode();
    attempts += 1;
  }

  return NextResponse.json({ message: "We could not create a referral code just now." }, { status: 409 });
}
