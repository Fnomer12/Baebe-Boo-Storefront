import "server-only";

import { NextResponse } from "next/server";
import { getCounterAuthorization } from "./authorization";

type CounterApiAuthorization =
  | {
      authorized: true;
      counter: NonNullable<Awaited<ReturnType<typeof getCounterAuthorization>>>;
    }
  | { authorized: false; response: NextResponse };

/**
 * Authorize a counter route handler.
 *
 * Route handlers must not use `requireCounter()`: it calls `redirect()`, which
 * throws NEXT_REDIRECT and surfaces to a `fetch` as a 307 to an HTML login page
 * rather than something the client can act on. This returns a JSON 401 instead.
 *
 * There is no capability argument. `shop_staff` carries no role column, so
 * every counter session has identical rights inside its own shop — the shop
 * scoping *is* the authorization, and it is applied by the caller using
 * `counter.staff.shop.id`, never a value from the request.
 */
export async function authorizeCounterApi(): Promise<CounterApiAuthorization> {
  const counter = await getCounterAuthorization();
  if (!counter) {
    return {
      authorized: false,
      response: NextResponse.json(
        { message: "Counter sign-in required." },
        { status: 401 },
      ),
    };
  }

  return { authorized: true, counter };
}
