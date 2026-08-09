import type { Metadata } from "next";
import Link from "next/link";
import { Clock, MapPin, Navigation, Phone } from "lucide-react";
import WhatsAppIcon from "@/components/WhatsAppIcon";
import { PageIntro, StorefrontPage, whatsappUrl } from "@/components/storefront/StorefrontChrome";
import { demoCatalogEnabled, fallbackShops, type StorefrontShop } from "@/components/storefront/catalog-data";
import { whatsappUrlFor } from "@/lib/public-contact";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Our stores", description: "Find a Baebe Boo store in Ghana, opening hours and ways to get in touch." };

async function verifiedShops(): Promise<StorefrontShop[]> {
  if (demoCatalogEnabled) return fallbackShops;
  try {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.from("shops").select("id,name,location,whatsapp_number").eq("is_active", true).order("created_at");
    if (error) return [];
    return (data || []).map((shop) => ({
      id: String(shop.id),
      name: String(shop.name),
      location: String(shop.location),
      hours: "Confirm today's hours with the store",
      phone: shop.whatsapp_number ? String(shop.whatsapp_number) : "",
      whatsapp: String(shop.whatsapp_number ?? ""),
    }));
  } catch {
    return [];
  }
}

export default async function StoresPage() {
  const shops = await verifiedShops();
  return (
    <StorefrontPage>
      <div className="storefront-shell pb-20 pt-28 sm:pt-32">
        <PageIntro eyebrow="Come say hello" title="A warm welcome is waiting." description="Visit for thoughtful recommendations, a closer look at our collection and help finding just the right thing." />
        <div className="storefront-locator-layout">
          <div className="overflow-hidden rounded-[2.3rem] bg-[#dcebed]">
            <iframe title="Interactive map of Ghana" src="https://www.openstreetmap.org/export/embed.html?bbox=-3.6%2C4.5%2C1.5%2C11.2&layer=mapnik" className="min-h-[28rem] w-full border-0" loading="lazy" />
          </div>
          <div className="space-y-4">{shops.length ? shops.map((shop) => <article key={shop.id} className="storefront-location-card"><div><p className="storefront-eyebrow">Verified Baebe Boo store</p><h2>{shop.name}</h2></div><ul><li><MapPin size={17} />{shop.location}</li><li><Clock size={17} />{shop.hours}</li>{shop.phone && <li><Phone size={17} />{shop.phone}</li>}</ul><div className="grid grid-cols-2 gap-2"><Link href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(shop.location)}`} target="_blank" className="storefront-secondary-button"><Navigation size={16} /> Directions</Link><Link href={whatsappUrlFor(shop.whatsapp)} target="_blank" rel="noopener noreferrer" className="storefront-primary-button"><WhatsAppIcon size={16} /> WhatsApp</Link></div></article>) : <div className="storefront-empty"><MapPin size={30} /><h2>Branch details are being verified</h2><p>Use WhatsApp for current store directions and opening hours.</p><Link href={whatsappUrl} className="storefront-primary-button mt-5">Ask our team</Link></div>}</div>
        </div>
      </div>
    </StorefrontPage>
  );
}
