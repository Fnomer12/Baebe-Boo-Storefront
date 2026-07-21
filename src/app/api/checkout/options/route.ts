import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function GET() {
  const [{ data: shopData, error: shopError }, { data: zoneData, error: zoneError }] =
    await Promise.all([
      supabaseAdmin
        .from("shops")
        .select("id,name,location")
        .eq("is_active", true)
        .order("created_at", { ascending: true }),
      supabaseAdmin
        .from("delivery_zones")
        .select("id,name,base_fee,free_delivery_threshold,estimated_days_min,estimated_days_max")
        .eq("is_active", true)
        .order("name", { ascending: true }),
    ]);

  if (shopError || zoneError) {
    return NextResponse.json(
      { status: false, message: "Checkout options are temporarily unavailable." },
      { status: 503 },
    );
  }

  return NextResponse.json(
    {
      status: true,
      shops: (shopData || []).map((shop) => ({
        id: String(shop.id),
        name: String(shop.name),
        location: String(shop.location),
      })),
      deliveryZones: (zoneData || []).map((zone) => ({
        id: String(zone.id),
        name: String(zone.name),
        baseFee: Number(zone.base_fee),
        freeDeliveryThreshold:
          zone.free_delivery_threshold === null
            ? null
            : Number(zone.free_delivery_threshold),
        estimatedDaysMin:
          zone.estimated_days_min === null ? null : Number(zone.estimated_days_min),
        estimatedDaysMax:
          zone.estimated_days_max === null ? null : Number(zone.estimated_days_max),
      })),
    },
    { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } },
  );
}
