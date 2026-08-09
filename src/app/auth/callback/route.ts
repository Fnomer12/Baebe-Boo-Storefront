import { NextResponse } from "next/server";
import { completeCustomerSignIn } from "@/lib/auth/post-sign-in";
import { tryCreateServerSupabaseClient } from "@/lib/supabase/server";

/**
 * Magic-link callback.
 *
 * Customers now sign in with an emailed code (`/api/auth/login-code`), but links
 * already sitting in inboxes stay valid for their TTL, so this route remains to
 * land them. It can be removed once those have expired.
 */
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
        await completeCustomerSignIn(supabase);
        return NextResponse.redirect(new URL(next, requestUrl.origin));
      }
    }
  }

  return NextResponse.redirect(
    new URL("/account/login?error=invalid-link", requestUrl.origin),
  );
}
