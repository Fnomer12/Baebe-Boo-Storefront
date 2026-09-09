import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeAdminApi } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

const policySchema = z.object({
  pointsPerCedi: z.number().int().positive().max(100_000),
  minimumRedemptionPoints: z.number().int().positive().max(10_000_000),
  maximumOrderShare: z.number().positive().max(1),
  allowOnline: z.boolean(),
  allowAtCounter: z.boolean(),
});

export async function PATCH(request: Request) {
  const authorization = await authorizeAdminApi("customers:write");
  if (!authorization.authorized) return authorization.response;

  const parsed = policySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: "Invalid redemption policy." }, { status: 400 });
  }
  const { error } = await supabaseAdmin
    .from("loyalty_redemption_policy")
    .update({
      points_per_cedi: parsed.data.pointsPerCedi,
      min_redemption_points: parsed.data.minimumRedemptionPoints,
      max_share_of_order: parsed.data.maximumOrderShare,
      allow_online: parsed.data.allowOnline,
      allow_at_counter: parsed.data.allowAtCounter,
      updated_at: new Date().toISOString(),
    })
    .eq("id", 1);
  if (error) {
    const missing = /relation .* does not exist|loyalty_redemption_policy/i.test(error.message || "");
    return NextResponse.json(
      { message: missing ? "Apply the loyalty migration to enable redemption rules." : "Policy could not be saved." },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true });
}
