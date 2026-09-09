import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeAdminApi } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

const patchSchema = z.object({
  storeReady: z.boolean(),
});

/**
 * The "Store live" switch on BaebeAdmin → Products.
 *
 * `storeReady: false` puts a "store getting ready" banner on the main
 * website; `true` removes it. Missing row (migration unapplied) reads as
 * ready so the shop never alarms customers over an unapplied migration.
 */
async function readStoreReady(): Promise<boolean | null> {
  const { data, error } = await supabaseAdmin
    .from("site_settings")
    .select("value")
    .eq("key", "store_ready")
    .maybeSingle();
  if (error) return null;
  if (!data) return true;
  return (data as { value: unknown }).value !== false;
}

export async function GET() {
  const authorization = await authorizeAdminApi("stores:read");
  if (!authorization.authorized) return authorization.response;

  const ready = await readStoreReady();
  if (ready === null) {
    return NextResponse.json(
      { message: "Store settings could not be loaded. Apply the site_settings migration." },
      { status: 500 },
    );
  }
  return NextResponse.json({ storeReady: ready });
}

export async function PATCH(request: Request) {
  const authorization = await authorizeAdminApi("stores:write");
  if (!authorization.authorized) return authorization.response;

  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: "Invalid store setting." }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from("site_settings")
    .upsert(
      { key: "store_ready", value: parsed.data.storeReady, updated_at: new Date().toISOString() },
      { onConflict: "key" },
    );
  if (error) {
    return NextResponse.json(
      { message: "Store setting could not be saved. Apply the site_settings migration." },
      { status: 500 },
    );
  }
  return NextResponse.json({ storeReady: parsed.data.storeReady });
}
