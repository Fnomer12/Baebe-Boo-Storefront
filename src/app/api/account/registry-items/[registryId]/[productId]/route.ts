import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeCustomerMutation } from "@/lib/account/customer-api";

type RegistryItemContext = { params: Promise<{ registryId: string; productId: string }> };

export async function DELETE(request: Request, context: RegistryItemContext) {
  const authorization = await authorizeCustomerMutation(request, "registry-item-delete", 20);
  if (!authorization.authorized) return authorization.response;

  const { registryId, productId } = await context.params;
  if (!z.uuid().safeParse(registryId).success || !z.uuid().safeParse(productId).success) {
    return NextResponse.json({ message: "Invalid registry item." }, { status: 400 });
  }

  const { supabase, userId } = authorization;
  const registry = await supabase
    .from("gift_registries")
    .select("id")
    .eq("id", registryId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!registry.data) {
    return NextResponse.json({ message: "Registry not found." }, { status: 404 });
  }

  const { error } = await supabase
    .from("gift_registry_items")
    .delete()
    .eq("registry_id", registryId)
    .eq("product_id", productId);

  if (error) {
    return NextResponse.json({ message: "We could not remove this item just now." }, { status: 409 });
  }

  return NextResponse.json({ deleted: true });
}
