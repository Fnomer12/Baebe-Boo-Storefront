import { NextResponse } from "next/server";
import { addressMutationSchema } from "@/lib/account/customer-workflows";
import { authorizeCustomerMutation } from "@/lib/account/customer-api";
import { tryCreateServerSupabaseClient } from "@/lib/supabase/server";

/**
 * The signed-in customer's saved addresses, default first. Added for checkout
 * prefill — the account page reads the same columns server-side. No origin
 * check: a read gated by the session cookie has no CSRF surface, and RLS
 * scopes the rows through the user client.
 */
export async function GET() {
  const supabase = await tryCreateServerSupabaseClient();
  if (!supabase) {
    return NextResponse.json({ addresses: [] }, { status: 503 });
  }
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user?.id) {
    return NextResponse.json({ addresses: [] }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("customer_addresses")
    .select(
      "id, label, recipient_name, phone, address_line_1, address_line_2, city, region, digital_address, delivery_instructions, is_default",
    )
    .eq("user_id", user.id)
    .order("is_default", { ascending: false })
    .order("updated_at", { ascending: false });

  if (error) {
    return NextResponse.json({ addresses: [] }, { status: 503 });
  }

  return NextResponse.json({
    addresses: (data || []).map((address) => ({
      id: address.id,
      label: address.label,
      recipientName: address.recipient_name,
      phone: address.phone,
      addressLine1: address.address_line_1,
      addressLine2: address.address_line_2,
      city: address.city,
      region: address.region,
      digitalAddress: address.digital_address,
      deliveryInstructions: address.delivery_instructions,
      isDefault: address.is_default,
    })),
  });
}

export async function POST(request: Request) {
  const authorization = await authorizeCustomerMutation(request, "address-create", 12);
  if (!authorization.authorized) return authorization.response;

  const input = addressMutationSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) {
    return NextResponse.json({ message: "Check the address details and try again." }, { status: 400 });
  }

  const { data, error } = await authorization.supabase.rpc("save_my_address", {
    p_address_id: null,
    p_label: input.data.label ?? "",
    p_recipient_name: input.data.recipientName,
    p_phone: input.data.phone,
    p_address_line_1: input.data.addressLine1,
    p_address_line_2: input.data.addressLine2 ?? "",
    p_city: input.data.city,
    p_region: input.data.region,
    p_digital_address: input.data.digitalAddress ?? "",
    p_delivery_instructions: input.data.deliveryInstructions ?? "",
    p_is_default: input.data.isDefault,
  });

  if (error || !data) {
    return NextResponse.json({ message: "We could not save this address just now." }, { status: 409 });
  }

  return NextResponse.json({ id: data }, { status: 201 });
}
