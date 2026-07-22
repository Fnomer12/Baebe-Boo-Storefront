import { NextResponse } from "next/server";
import { tryCreateServerSupabaseClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const requestedNext = requestUrl.searchParams.get("next");
  const next = requestedNext?.startsWith("/") ? requestedNext : "/account";

  if (code) {
    const supabase = await tryCreateServerSupabaseClient();
    if (supabase) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) {
        await supabase.rpc("claim_my_guest_orders");
        return NextResponse.redirect(new URL(next, requestUrl.origin));
      }
    }
  }

  return NextResponse.redirect(
    new URL("/account/login?error=invalid-link", requestUrl.origin),
  );
}
