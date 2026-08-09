import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) {
      return NextResponse.json({ account: null, ledger: [] }, { status: 401 });
    }

    const [accountResult, ledgerResult] = await Promise.all([
      supabase
        .from("reward_accounts")
        .select("available_points, pending_points, lifetime_points, updated_at")
        .eq("user_id", authData.user.id)
        .maybeSingle(),
      supabase
        .from("reward_ledger")
        .select("id, entry_type, points, status, reason, created_at, order_id")
        .eq("user_id", authData.user.id)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

    return NextResponse.json({
      account: accountResult.data ?? null,
      ledger: ledgerResult.data ?? [],
    });
  } catch {
    return NextResponse.json({ account: null, ledger: [] }, { status: 503 });
  }
}
