import type { Metadata } from "next";
import Link from "next/link";
import { Clock, MapPin, MessageCircle, Navigation, Phone } from "lucide-react";
import { PageIntro, StorefrontPage, whatsappUrl } from "@/components/storefront/StorefrontChrome";
import { fallbackShops } from "@/components/storefront/catalog-data";

export const metadata: Metadata = { title: "Our stores | Baebe Boo", description: "Find a Baebe Boo store in Ghana, opening hours and ways to get in touch." };

export default function StoresPage() {
  return (
    <StorefrontPage>
      <div className="storefront-shell pb-20 pt-28 sm:pt-32">
        <PageIntro eyebrow="Come say hello" title="A warm welcome is waiting." description="Visit for thoughtful recommendations, a closer look at our collection and help finding just the right thing." />
        <div className="storefront-locator-layout">
          <div className="storefront-map-placeholder"><div className="storefront-map-grid" /><MapPin size={38} /><strong>Baebe Boo in Ghana</strong><span>Live map integration ready for verified branch coordinates</span></div>
          <div className="space-y-4">{fallbackShops.map((shop) => <article key={shop.id} className="storefront-location-card"><div className="flex items-start justify-between gap-3"><div><p className="storefront-eyebrow">Baebe Boo store</p><h2>{shop.name}</h2></div><span className="rounded-full bg-[#e4f4e9] px-3 py-1 text-xs font-bold text-[#285d39]">Open today</span></div><ul><li><MapPin size={17} />{shop.location}</li><li><Clock size={17} />{shop.hours}</li><li><Phone size={17} />{shop.phone}</li></ul><div className="grid grid-cols-2 gap-2"><Link href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(shop.location)}`} target="_blank" className="storefront-secondary-button"><Navigation size={16} /> Directions</Link><Link href={whatsappUrl} target="_blank" className="storefront-primary-button"><MessageCircle size={16} /> WhatsApp</Link></div></article>)}</div>
        </div>
      </div>
    </StorefrontPage>
  );
}
