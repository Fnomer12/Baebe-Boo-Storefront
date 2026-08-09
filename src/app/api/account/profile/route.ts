import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { authorizeCustomerMutation } from "@/lib/account/customer-api";
import { profileMutationSchema } from "@/lib/account/customer-workflows";

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) {
      return NextResponse.json({ profile: null, children: [] }, { status: 401 });
    }

    const [profileResult, childrenResult] = await Promise.all([
      supabase
        .from("customer_profiles")
        .select("user_id, email, full_name, phone, date_of_birth, marketing_status, created_at, updated_at")
        .eq("user_id", authData.user.id)
        .maybeSingle(),
      supabase
        .from("customer_children")
        .select("id, first_name, date_of_birth, age_range_taxonomy_id, created_at")
        .eq("user_id", authData.user.id)
        .order("created_at", { ascending: true }),
    ]);

    return NextResponse.json({
      profile: profileResult.data ?? null,
      children: childrenResult.data ?? [],
    });
  } catch {
    return NextResponse.json({ profile: null, children: [] }, { status: 503 });
  }
}

export async function PATCH(request: Request) {
  const authorization = await authorizeCustomerMutation(request, "profile-update", 10);
  if (!authorization.authorized) return authorization.response;

  const input = profileMutationSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) {
    return NextResponse.json({ message: "Check the profile details and try again." }, { status: 400 });
  }

  const { supabase, userId } = authorization;
  const { error } = await supabase
    .from("customer_profiles")
    .update({
      full_name: input.data.fullName,
      phone: input.data.phone,
      date_of_birth: input.data.dateOfBirth,
      marketing_status: input.data.marketingStatus,
    })
    .eq("user_id", userId);

  if (error) {
    return NextResponse.json({ message: "We could not update your profile just now." }, { status: 409 });
  }

  return NextResponse.json({ updated: true });
}
