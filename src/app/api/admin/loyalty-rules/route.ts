import { NextResponse } from "next/server";
import { z } from "zod";
import { parsePurchaseEarnConfig } from "@/domain/commerce/rewards";
import { authorizeAdminApi } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

const patchSchema = z.object({
  id: z.string().uuid(),
  points: z.number().int().positive().optional(),
  isActive: z.boolean().optional(),
  earnOnline: z.boolean().optional(),
  earnAtCounter: z.boolean().optional(),
  config: z.record(z.string(), z.unknown()).optional(),
}).refine((value) => value.points !== undefined || value.isActive !== undefined || value.earnOnline !== undefined || value.earnAtCounter !== undefined || value.config !== undefined, {
  message: "Nothing to update.",
});

export async function GET() {
  const authorization = await authorizeAdminApi("customers:read");
  if (!authorization.authorized) return authorization.response;

  const attempt = await supabaseAdmin
    .from("loyalty_rules")
    .select("id, event_type, points, is_active, earn_online, earn_at_counter, config, updated_at")
    .order("event_type", { ascending: true });

  let rows = attempt.data;
  if (attempt.error) {
    // Channel/config columns missing (migration unapplied): legacy shape.
    const legacy = await supabaseAdmin
      .from("loyalty_rules")
      .select("id, event_type, points, is_active, updated_at")
      .order("event_type", { ascending: true });
    if (legacy.error) {
      return NextResponse.json(
        { message: "Loyalty rules could not be loaded." },
        { status: 500 },
      );
    }
    rows = (legacy.data || []).map((row) => ({
      ...row,
      earn_online: true,
      earn_at_counter: false,
      config: row.event_type === "purchase" ? { points_per_cedi: 1 } : {},
    }));
  }

  const [tiersResult, policyResult] = await Promise.all([
    supabaseAdmin.from("loyalty_tiers").select("id, name, min_lifetime_points, earn_multiplier, is_active").order("sort_order", { ascending: true }),
    supabaseAdmin.from("loyalty_redemption_policy").select("points_per_cedi, min_redemption_points, max_share_of_order, allow_online, allow_at_counter").eq("id", 1).maybeSingle(),
  ]);

  return NextResponse.json({
    rules: (rows || []).map((rule) => ({
      id: rule.id,
      eventType: rule.event_type,
      points: rule.points,
      isActive: rule.is_active,
      earnOnline: rule.earn_online !== false,
      earnAtCounter: rule.earn_at_counter === true,
      config: rule.config || {},
      updatedAt: rule.updated_at,
    })),
    tiers: tiersResult.error ? [] : (tiersResult.data || []).map((tier) => ({
      id: tier.id,
      name: tier.name,
      minLifetimePoints: Number(tier.min_lifetime_points),
      earnMultiplier: Number(tier.earn_multiplier),
      isActive: tier.is_active,
    })),
    redemptionPolicy: policyResult.error || !policyResult.data
      ? { pointsPerCedi: 100, minimumRedemptionPoints: 500, maximumOrderShare: 0.2, allowOnline: true, allowAtCounter: false }
      : {
        pointsPerCedi: Number(policyResult.data.points_per_cedi),
        minimumRedemptionPoints: Number(policyResult.data.min_redemption_points),
        maximumOrderShare: Number(policyResult.data.max_share_of_order),
        allowOnline: policyResult.data.allow_online !== false,
        allowAtCounter: policyResult.data.allow_at_counter === true,
      },
  });
}

export async function PATCH(request: Request) {
  const authorization = await authorizeAdminApi("customers:write");
  if (!authorization.authorized) return authorization.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { message: "Invalid loyalty rule update." },
      { status: 400 },
    );
  }

  const update: Record<string, unknown> = {};
  if (parsed.data.points !== undefined) update.points = parsed.data.points;
  if (parsed.data.isActive !== undefined) update.is_active = parsed.data.isActive;
  if (parsed.data.earnOnline !== undefined) update.earn_online = parsed.data.earnOnline;
  if (parsed.data.earnAtCounter !== undefined) update.earn_at_counter = parsed.data.earnAtCounter;
  if (parsed.data.config !== undefined) {
    // Validated structurally: purchase earn only reads known keys, unknown
    // keys are ignored downstream rather than rejected here.
    update.config = parsed.data.config;
    if (Object.keys(parsed.data.config).length > 0) {
      // Touch-test the purchase parser so a nonsense rate fails loudly.
      parsePurchaseEarnConfig(parsed.data.config);
    }
  }

  const { error } = await supabaseAdmin
    .from("loyalty_rules")
    .update(update)
    .eq("id", parsed.data.id);

  if (error) {
    // Channel/config columns missing: retry with points-only when that is all
    // that was asked for.
    if (
      parsed.data.points !== undefined &&
      Object.keys(update).length > 1 &&
      /earn_online|earn_at_counter|config|is_active/i.test(error.message || "")
    ) {
      const { error: retryError } = await supabaseAdmin
        .from("loyalty_rules")
        .update({ points: parsed.data.points })
        .eq("id", parsed.data.id);
      if (retryError) {
        return NextResponse.json(
          { message: "Loyalty rule could not be updated." },
          { status: 500 },
        );
      }
    } else if (/is_active/i.test(error.message || "") && parsed.data.isActive !== undefined && parsed.data.points === undefined) {
      return NextResponse.json(
        { message: "Apply the loyalty migration to enable on/off switches." },
        { status: 500 },
      );
    } else {
      return NextResponse.json(
        { message: "Loyalty rule could not be updated." },
        { status: 500 },
      );
    }
  }

  return NextResponse.json({ id: parsed.data.id, ...update });
}
