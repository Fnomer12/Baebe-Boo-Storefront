import { NextResponse } from "next/server";
import { isSupabaseAdminConfigured, supabaseAdmin } from "@/lib/supabase-admin";

export async function GET() {
  if (!isSupabaseAdminConfigured) {
    return NextResponse.json({ status: true, promotions: [] });
  }

  const { data, error } = await supabaseAdmin
    .from("promotions")
    .select("id,name,description,promotion_type,value,starts_at,ends_at")
    .eq("status", "active")
    .order("ends_at", { ascending: true, nullsFirst: false })
    .limit(10);

  if (error) {
    return NextResponse.json({ status: true, promotions: [] });
  }

  return NextResponse.json(
    { status: true, promotions: data || [] },
    { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } },
  );
}
