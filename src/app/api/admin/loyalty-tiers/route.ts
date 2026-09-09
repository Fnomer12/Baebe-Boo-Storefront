import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeAdminApi } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

const tierSchema = z.object({
  name: z.string().trim().min(1).max(80),
  minLifetimePoints: z.number().int().min(0).max(10_000_000),
  earnMultiplier: z.number().min(0.1).max(100),
  isActive: z.boolean().optional(),
});

const tierPatchSchema = tierSchema.partial().extend({ id: z.string().uuid() });

export async function POST(request: Request) {
  const authorization = await authorizeAdminApi("customers:write");
  if (!authorization.authorized) return authorization.response;

  const parsed = tierSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: "Invalid loyalty tier." }, { status: 400 });
  }
  const { data, error } = await supabaseAdmin
    .from("loyalty_tiers")
    .insert({
      name: parsed.data.name,
      min_lifetime_points: parsed.data.minLifetimePoints,
      earn_multiplier: parsed.data.earnMultiplier,
      is_active: parsed.data.isActive ?? true,
    })
    .select("id")
    .single();
  if (error) {
    const missing = /relation .* does not exist|loyalty_tiers/i.test(error.message || "");
    return NextResponse.json(
      { message: missing ? "Apply the loyalty migration to enable tiers." : "Tier could not be created." },
      { status: missing ? 500 : 500 },
    );
  }
  return NextResponse.json({ id: (data as { id: string }).id }, { status: 201 });
}

export async function PATCH(request: Request) {
  const authorization = await authorizeAdminApi("customers:write");
  if (!authorization.authorized) return authorization.response;

  const parsed = tierPatchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: "Invalid loyalty tier update." }, { status: 400 });
  }
  const { id, ...fields } = parsed.data;
  const update: Record<string, unknown> = {};
  if (fields.name !== undefined) update.name = fields.name;
  if (fields.minLifetimePoints !== undefined) update.min_lifetime_points = fields.minLifetimePoints;
  if (fields.earnMultiplier !== undefined) update.earn_multiplier = fields.earnMultiplier;
  if (fields.isActive !== undefined) update.is_active = fields.isActive;
  const { error } = await supabaseAdmin.from("loyalty_tiers").update(update).eq("id", id);
  if (error) {
    return NextResponse.json({ message: "Tier could not be updated." }, { status: 500 });
  }
  return NextResponse.json({ id });
}

export async function DELETE(request: Request) {
  const authorization = await authorizeAdminApi("customers:write");
  if (!authorization.authorized) return authorization.response;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ message: "Missing tier id." }, { status: 400 });
  const { error } = await supabaseAdmin.from("loyalty_tiers").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ message: "Tier could not be deleted." }, { status: 500 });
  }
  return NextResponse.json({ id, deleted: true });
}
