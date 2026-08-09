import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeCustomerMutation } from "@/lib/account/customer-api";
import { registryMutationSchema } from "@/lib/account/customer-workflows";

type RegistryContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RegistryContext) {
  const authorization = await authorizeCustomerMutation(request, "registry-update", 10);
  if (!authorization.authorized) return authorization.response;

  const { id } = await context.params;
  if (!z.uuid().safeParse(id).success) {
    return NextResponse.json({ message: "Invalid registry." }, { status: 400 });
  }

  const input = registryMutationSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) {
    return NextResponse.json({ message: "Check the registry details and try again." }, { status: 400 });
  }

  const { supabase, userId } = authorization;
  const { error } = await supabase
    .from("gift_registries")
    .update({
      title: input.data.title,
      event_date: input.data.eventDate,
      status: input.data.status,
    })
    .eq("id", id)
    .eq("user_id", userId);

  if (error) {
    return NextResponse.json({ message: "We could not update this registry just now." }, { status: 409 });
  }

  return NextResponse.json({ updated: true });
}

export async function DELETE(request: Request, context: RegistryContext) {
  const authorization = await authorizeCustomerMutation(request, "registry-delete", 10);
  if (!authorization.authorized) return authorization.response;

  const { id } = await context.params;
  if (!z.uuid().safeParse(id).success) {
    return NextResponse.json({ message: "Invalid registry." }, { status: 400 });
  }

  const { supabase, userId } = authorization;
  const { error } = await supabase.from("gift_registries").delete().eq("id", id).eq("user_id", userId);

  if (error) {
    return NextResponse.json({ message: "We could not remove this registry just now." }, { status: 409 });
  }

  return NextResponse.json({ deleted: true });
}
