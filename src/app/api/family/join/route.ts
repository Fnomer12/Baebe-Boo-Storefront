import { NextResponse } from "next/server";
import { z } from "zod";
import { rateLimit } from "@/lib/rate-limit";
import { isSupabaseAdminConfigured, supabaseAdmin } from "@/lib/supabase-admin";

const joinSchema = z.object({
  parentName: z.string().trim().min(2).max(120),
  email: z.email().trim().toLowerCase(),
  phone: z.string().trim().min(9).max(24),
  childName: z.string().trim().min(1).max(120),
  childDateOfBirth: z.iso.date(),
  marketingConsent: z.literal(true),
});

export async function POST(request: Request) {
  const throttle = rateLimit(request, "family-join", 5, 60 * 60_000);
  if (!throttle.allowed) {
    return NextResponse.json(
      { message: "Too many attempts. Please try again later." },
      { status: 429, headers: { "Retry-After": String(throttle.retryAfter) } },
    );
  }

  const input = joinSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) {
    return NextResponse.json({ message: "Check your family details and consent." }, { status: 400 });
  }

  if (!isSupabaseAdminConfigured) {
    return NextResponse.json(
      { message: "Family signup is temporarily unavailable." },
      { status: 503 },
    );
  }

  const childNames = input.data.childName.split(/\s+/);
  const { error } = await supabaseAdmin.rpc("join_family", {
    p_parent_name: input.data.parentName,
    p_email: input.data.email,
    p_phone: input.data.phone,
    p_child_first_name: childNames[0],
    p_child_last_name: childNames.slice(1).join(" ") || "Not provided",
    p_child_date_of_birth: input.data.childDateOfBirth,
    p_policy_version: "2026-07-21",
    p_source: "storefront_family_form",
  });

  if (error) {
    return NextResponse.json({ message: "We could not save your details just now." }, { status: 503 });
  }

  return NextResponse.json({ joined: true });
}
