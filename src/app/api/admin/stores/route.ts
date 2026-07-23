import { NextResponse } from "next/server";
import { authorizeAdminApi } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function GET() {
  const authorization = await authorizeAdminApi("stores:read");
  if (!authorization.authorized) return authorization.response;

  const { data, error } = await supabaseAdmin
    .from("shops")
    .select("id, name, location, database_name, is_active, created_at")
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ message: "Stores could not be loaded." }, { status: 500 });
  return NextResponse.json({ stores: (data || []).map((store) => ({
    id: store.id,
    name: store.name,
    location: store.location,
    databaseName: store.database_name,
    isActive: store.is_active,
    createdAt: store.created_at,
  })) });
}
