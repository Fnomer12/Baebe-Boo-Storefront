import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const protectedRoutes = ["/BaebeAdmin", "/BaebeCounter", "/account"];

function isProtected(pathname: string) {
  return protectedRoutes.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}

function isLoginRoute(pathname: string) {
  return pathname.endsWith("/login") || pathname === "/account/login";
}

export async function refreshSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet) => {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  if (
    isProtected(request.nextUrl.pathname) &&
    !isLoginRoute(request.nextUrl.pathname) &&
    !data?.claims
  ) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = request.nextUrl.pathname.startsWith("/BaebeAdmin")
      ? "/BaebeAdmin/login"
      : request.nextUrl.pathname.startsWith("/BaebeCounter")
        ? "/BaebeCounter/login"
        : "/account/login";
    loginUrl.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}
