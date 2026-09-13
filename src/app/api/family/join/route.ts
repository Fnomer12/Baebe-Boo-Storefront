import { NextResponse } from "next/server";
import { z } from "zod";
import { normalizeGhanaPhoneCanonical } from "@/lib/phone";
import { rateLimit } from "@/lib/rate-limit";
import { isSupabaseAdminConfigured, supabaseAdmin } from "@/lib/supabase-admin";

const joinSchema = z.object({
  parentName: z.string().trim().min(2).max(120),
  email: z.email().trim().toLowerCase(),
  phone: z
    .string()
    .trim()
    .min(9)
    .max(24)
    .refine((value) => normalizeGhanaPhoneCanonical(value) !== null, {
      message: "Enter a valid Ghana number starting with +233.",
    })
    .transform((value) => normalizeGhanaPhoneCanonical(value) as string),
  childName: z.string().trim().min(1).max(120),
  childDateOfBirth: z.iso.date(),
  marketingConsent: z.literal(true),
  smsConsent: z.boolean().optional().default(true),
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

  // Explicit SMS opt-in is recorded separately so withdrawing SMS later
  // does not touch the email family consent from join_family.
  if (input.data.smsConsent) {
    try {
      await supabaseAdmin.from("customer_consents").insert({
        email: input.data.email,
        phone: input.data.phone,
        purpose: "family-offers",
        channel: "sms",
        status: "granted",
        policy_version: "2026-07-21",
        source: "storefront_family_form",
      });
    } catch {
      // Family membership already succeeded; consent logging is best-effort.
    }
  }

  return NextResponse.json({ joined: true });
}
