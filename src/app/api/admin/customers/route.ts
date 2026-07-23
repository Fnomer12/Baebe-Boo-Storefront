import { NextResponse } from "next/server";
import { authorizeAdminApi } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function GET() {
  const authorization = await authorizeAdminApi("customers:read");
  if (!authorization.authorized) return authorization.response;

  const { data, error } = await supabaseAdmin
    .from("members")
    .select("id, parent_name, child_first_name, child_last_name, phone, email, child_dob, created_at")
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ message: "Customers could not be loaded." }, { status: 500 });
  return NextResponse.json({ customers: (data || []).map((customer) => ({
    id: customer.id,
    name: customer.parent_name,
    childName: [customer.child_first_name, customer.child_last_name].filter(Boolean).join(" "),
    phone: customer.phone,
    email: customer.email,
    childDob: customer.child_dob,
    createdAt: customer.created_at,
  })) });
}
