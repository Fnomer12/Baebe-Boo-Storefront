import Link from "next/link";
import { Baby, Camera, Mail, MapPin, MessageCircle, Phone } from "lucide-react";
import { whatsappUrl } from "@/lib/public-contact";

const groups = [
  {
    title: "Shop",
    links: [
      ["New arrivals", "/store?sort=newest"],
      ["Best sellers", "/store?collection=best-sellers"],
      ["Gift sets", "/category/gift-shop"],
      ["Clearance", "/category/clearance"],
    ],
  },
  {
    title: "Family help",
    links: [
      ["Track an order", "/track-records"],
      ["Returns", "/account/returns"],
      ["Parenting hub", "/parenting"],
      ["My account", "/account"],
    ],
  },
  {
    title: "Baebe Boo",
    links: [
      ["Our story", "/about"],
      ["Our stores", "/stores"],
      ["Authenticity promise", "/trust"],
      ["Privacy", "/privacy"],
    ],
  },
] as const;

export default function Footer() {
  return (
    <footer className="mt-auto bg-[#07141c] px-4 py-12 text-white sm:px-6 sm:py-16">
      <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[1.4fr_2fr]">
        <div>
          <Link href="/" className="inline-flex items-center gap-3 text-2xl font-semibold">
            <span className="grid h-11 w-11 place-items-center rounded-full bg-sky-300 text-black"><Baby size={23} /></span>
            Baebe Boo
          </Link>
          <p className="mt-5 max-w-sm text-sm leading-7 text-white/60">
            The trusted destination for everything baby and child. Authentic products,
            thoughtful guidance and nationwide care from Ghana.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <a href={whatsappUrl} className="inline-flex items-center gap-2 rounded-full bg-[#25d366] px-4 py-2.5 text-sm font-semibold !text-[#07141c]"><MessageCircle size={17} /> WhatsApp</a>
            <a href="mailto:hello@baebe-boo.com" className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2.5 text-sm font-semibold"><Mail size={17} /> Email</a>
          </div>
        </div>
        <div className="grid gap-8 sm:grid-cols-3">
          {groups.map((group) => (
            <div key={group.title}>
              <h2 className="text-sm font-semibold">{group.title}</h2>
              <ul className="mt-4 space-y-3 text-sm text-white/55">
                {group.links.map(([label, href]) => <li key={label}><Link href={href} className="transition hover:text-white">{label}</Link></li>)}
              </ul>
            </div>
          ))}
        </div>
      </div>
      <div className="mx-auto mt-12 flex max-w-7xl flex-wrap items-center justify-between gap-4 border-t border-white/10 pt-6 text-xs text-white/60">
        <p>© {new Date().getFullYear()} Baebe Boo, Brightseed Group.</p>
        <div className="flex flex-wrap gap-4">
          <span className="inline-flex items-center gap-1.5"><MapPin size={14} /> Ghana</span>
          <span className="inline-flex items-center gap-1.5"><Phone size={14} /> Fast customer support</span>
          <span className="inline-flex items-center gap-1.5"><Camera size={14} /> @baebeboo</span>
        </div>
      </div>
    </footer>
  );
}
