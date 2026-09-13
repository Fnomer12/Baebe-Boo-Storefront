import Link from "next/link";
import WhatsAppIcon from "@/components/WhatsAppIcon";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import StoreReadinessBanner from "@/components/storefront/StoreReadinessBanner";
import { whatsappUrl } from "@/lib/public-contact";

export { whatsappUrl } from "@/lib/public-contact";

/**
 * Commerce-only readiness banner: `showReadinessBanner` defaults to false so
 * only /store, product, category, compare, and checkout-related pages opt in.
 * Sign-in, account, home, and content pages stay banner-free automatically.
 */
export function StorefrontPage({ children, cartCount = 0, showReadinessBanner = false }: { children: React.ReactNode; cartCount?: number; showReadinessBanner?: boolean }) {
  return (
    <main className="flex min-h-screen flex-col bg-[var(--color-cream)] text-[var(--color-ink)]">
      {showReadinessBanner ? <StoreReadinessBanner /> : null}
      <Navbar cartCount={cartCount} />
      {/* Grows so the footer sits at the bottom on short pages instead of leaving dead space beneath it. */}
      <div className="flex-1">{children}</div>
      <Footer />
      <Link href={whatsappUrl} target="_blank" rel="noopener noreferrer" aria-label="Chat with Baebe Boo on WhatsApp" className="fixed bottom-4 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-[#128C7E] text-white shadow-[0_8px_24px_rgba(0,0,0,0.18)] transition hover:-translate-y-1 sm:bottom-6 sm:right-6">
        <WhatsAppIcon size={26} />
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
