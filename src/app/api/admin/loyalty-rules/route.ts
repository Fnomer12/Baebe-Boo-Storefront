import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeAdminApi } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

const patchSchema = z.object({
  id: z.string().uuid(),
  points: z.number().int().positive(),
});

export async function GET() {
  const authorization = await authorizeAdminApi("customers:read");
  if (!authorization.authorized) return authorization.response;

  const { data: rules, error } = await supabaseAdmin
    .from("loyalty_rules")
    .select("id, event_type, points, is_active, updated_at")
    .order("event_type", { ascending: true });

  if (error) {
    return NextResponse.json(
      { message: "Loyalty rules could not be loaded." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    rules: (rules || []).map((rule) => ({
      id: rule.id,
      eventType: rule.event_type,
      points: rule.points,
      isActive: rule.is_active,
      updatedAt: rule.updated_at,
    })),
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

  const { error } = await supabaseAdmin
    .from("loyalty_rules")
    .update({ points: parsed.data.points })
    .eq("id", parsed.data.id);

  if (error) {
    return NextResponse.json(
      { message: "Loyalty rule could not be updated." },
      { status: 500 },
    );
  }

  return NextResponse.json({ id: parsed.data.id, points: parsed.data.points });
}
