import { NextResponse } from "next/server";
import { isStoreReady } from "@/lib/store-readiness";

/**
 * World-readable store status for the storefront banner and checkout gate.
 *
 * Always fresh (`no-store`): a cached "not ready" would linger after the shop
 * goes live, and a cached "ready" would hide the banner when it matters.
 * Fails open to ready so a broken endpoint never alarms customers.
 */
export async function GET() {
  const ready = await isStoreReady();
  return NextResponse.json(
    { status: true, ready },
    { headers: { "Cache-Control": "no-store" } },
  );
}
