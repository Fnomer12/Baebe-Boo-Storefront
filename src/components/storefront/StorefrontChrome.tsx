import Link from "next/link";
import { MessageCircle } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { whatsappUrl } from "@/lib/public-contact";

export { whatsappUrl } from "@/lib/public-contact";

export function StorefrontPage({ children, cartCount = 0 }: { children: React.ReactNode; cartCount?: number }) {
  return (
    <main className="min-h-screen bg-[#fbf7f2] text-[#201d1c]">
      <Navbar cartCount={cartCount} />
      {children}
      <Footer />
      <Link href={whatsappUrl} target="_blank" rel="noopener noreferrer" aria-label="Chat with Baebe Boo on WhatsApp" className="fixed bottom-4 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-[0_12px_34px_rgba(37,211,102,0.35)] transition hover:-translate-y-1 sm:bottom-6 sm:right-6">
        <MessageCircle size={25} />
      </Link>
    </main>
  );
}

export function PageIntro({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return (
    <header className="storefront-page-intro">
      <p className="storefront-eyebrow">{eyebrow}</p>
      <h1>{title}</h1>
      <p>{description}</p>
    </header>
  );
}
