import { NextResponse } from "next/server";
import { authorizeCounterApi } from "@/lib/auth";

/**
 * Who is at this till, as display strings.
 *
 * The login page probes this before navigating: a customer who signs in with
 * a valid Supabase password but has no counter assignment would otherwise
 * bounce between the login page and the protected layout forever.
 *
 * Deliberately returns no shop id and no staff id. Nothing in the browser
 * needs either — every counter route derives them from the session.
 */
export async function GET() {
  const authorization = await authorizeCounterApi();
  if (!authorization.authorized) return authorization.response;

  const { staff } = authorization.counter;
  return NextResponse.json({
    session: {
      staffName: staff.name,
      staffCode: staff.code,
      shopName: staff.shop.name,
      shopLocation: staff.shop.location,
    },
  });
}
