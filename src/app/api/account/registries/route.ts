import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { authorizeCustomerMutation } from "@/lib/account/customer-api";
import { registryMutationSchema } from "@/lib/account/customer-workflows";

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) {
      return NextResponse.json({ registries: [] }, { status: 401 });
    }

    const { data, error } = await supabase
      .from("gift_registries")
      .select(
        `id, title, event_date, status, public_token, created_at,
        gift_registry_items(product_id, requested_quantity, purchased_quantity, priority, products(name, image_url, price))`,
      )
      .eq("user_id", authData.user.id)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ registries: [] }, { status: 503 });
    }

    return NextResponse.json({ registries: data ?? [] });
  } catch {
    return NextResponse.json({ registries: [] }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const authorization = await authorizeCustomerMutation(request, "registry-create", 10);
  if (!authorization.authorized) return authorization.response;

  const input = registryMutationSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) {
    return NextResponse.json({ message: "Check the registry details and try again." }, { status: 400 });
  }

  const { supabase, userId } = authorization;
  const { data, error } = await supabase
    .from("gift_registries")
    .insert({
      user_id: userId,
      title: input.data.title,
      event_date: input.data.eventDate,
      status: input.data.status,
    })
    .select("id")
    .single();

  if (error || !data) {
    return NextResponse.json({ message: "We could not create this registry just now." }, { status: 409 });
  }

  return NextResponse.json({ id: data.id }, { status: 201 });
}
