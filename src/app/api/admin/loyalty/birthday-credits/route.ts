import { NextResponse } from "next/server";
import { authorizeAdminApi } from "@/lib/auth";
import { creditBirthdays } from "../../campaigns/_birthday-credits";

/**
 * Run today's birthday credits by hand.
 *
 * The scheduled dispatcher (`/api/cron/campaigns`) does this on every tick, so
 * this endpoint is now a manual re-run rather than the only way it ever
 * happens — it had no caller at all before. It is safe to press repeatedly:
 * `credit_loyalty_points` de-duplicates on the ledger's source key.
 */
export async function POST() {
  const authorization = await authorizeAdminApi("customers:write");
  if (!authorization.authorized) return authorization.response;

  try {
    return NextResponse.json(await creditBirthdays());
  } catch {
    return NextResponse.json(
      { message: "Birthday points could not be awarded." },
      { status: 500 },
    );
  }
}
