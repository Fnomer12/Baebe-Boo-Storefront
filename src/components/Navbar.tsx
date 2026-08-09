"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { whatsappUrl } from "@/lib/public-contact";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import {
  Menu,
  ShoppingBag,
  X,
  Home,
  Store,
  Truck,
  Search,
  UserRound,
  BookOpen,
  MapPin,
  Info,
  LogOut,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import InstantSearch from "@/components/storefront/InstantSearch";
import WhatsAppIcon from "@/components/WhatsAppIcon";

type NavbarProps = {
  cartCount?: number;
};

type AccountSummary = {
  name: string;
  email: string;
};

function accountFromUser(user: User | null): AccountSummary | null {
  if (!user) return null;
  const fullName = (user.user_metadata as { full_name?: unknown } | null)?.full_name;
  return {
    name: typeof fullName === "string" && fullName.trim() ? fullName : user.email || "My account",
    email: user.email || "",
  };
}

export default function Navbar({ cartCount = 0 }: NavbarProps) {
  const router = useRouter();

  const [liveCartCount, setLiveCartCount] = useState(cartCount);
  const [cartMessage, setCartMessage] = useState("");

  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);

  const [account, setAccount] = useState<AccountSummary | null>(null);

  useEffect(() => {
    const updateCartCount = () => {
      let storedCart: unknown = [];
      try {
        storedCart = JSON.parse(localStorage.getItem("baebe_cart") || "[]") as unknown;
      } catch {
        storedCart = [];
      }
      const cart = Array.isArray(storedCart) ? storedCart : [];
      const total = cart.reduce((sum: number, item: unknown) => {
        if (!item || typeof item !== "object" || !("quantity" in item)) return sum;
        return sum + Number(item.quantity || 0);
      }, 0);

      setLiveCartCount(total);
    };

    updateCartCount();

    window.addEventListener("baebe_cart_updated", updateCartCount);
    window.addEventListener("storage", updateCartCount);

    return () => {
      window.removeEventListener("baebe_cart_updated", updateCartCount);
      window.removeEventListener("storage", updateCartCount);
    };
  }, []);

  useEffect(() => {
    const showMessage = (event: Event) => {
      const customEvent = event as CustomEvent<string>;

      setCartMessage(
        customEvent.detail ||
          "Can't add that item again because the available stock has been reached."
      );

      setTimeout(() => {
        setCartMessage("");
      }, 3000);
    };

    window.addEventListener("baebe_cart_message", showMessage);

    return () => window.removeEventListener("baebe_cart_message", showMessage);
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      setMinimized(window.scrollY > 40);
    };

    handleScroll();
    window.addEventListener("scroll", handleScroll);

    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    if (!menuOpen && !searchOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
        setSearchOpen(false);
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [menuOpen, searchOpen]);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let active = true;

    void supabase.auth.getUser().then(({ data }) => {
      if (active) setAccount(accountFromUser(data.user));
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setAccount(accountFromUser(session?.user ?? null));
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
    setMenuOpen(false);
    router.refresh();
  }

  return (
    <>
      {/* The pill is inset, so page content used to scroll visibly through the
          gutters above and beside it — headings collided with the bar and read
          as a rendering fault. This blurred band sits behind the pill and
          fades out below it, masking that content without painting a hard
          edge over the body's gradient canvas. */}
      <header className="fixed left-0 top-0 z-50 w-full px-2 pt-2 before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:-z-10 before:h-[calc(100%+0.75rem)] before:backdrop-blur-md before:[mask-image:linear-gradient(to_bottom,black_60%,transparent)] sm:px-3 sm:pt-3 md:px-4 md:pt-4">
        <div
          className={`mx-auto flex min-w-0 max-w-7xl items-center justify-between rounded-full border border-white/70 bg-white/90 shadow-lg shadow-black/5 transition-all duration-500 ${
            minimized
              ? "h-14 px-2 sm:px-3 md:h-16 md:px-4"
              : "h-16 px-2 sm:h-[72px] sm:px-3 md:h-20 md:px-5"
          }`}
        >
          <Link
            href="/"
            className="flex min-w-0 flex-1 items-center gap-2 md:gap-3"
          >
            <div
              className={`relative shrink-0 overflow-hidden rounded-full border border-white/60 bg-white shadow-sm transition-all duration-500 ${
                minimized
                ? "h-10 w-10 md:h-11 md:w-11"
                  : "h-11 w-11 sm:h-12 sm:w-12 md:h-14 md:w-14"
              }`}
            >
              <Image
                src="/baebe-boo.jpg"
                alt="Baebe Boo baby store"
                fill
                sizes="(min-width: 768px) 64px, 48px"
                className="object-cover"
              />
            </div>

            <span
              className={`min-w-0 truncate whitespace-nowrap font-extrabold tracking-tight text-black transition-all duration-500 ${
                minimized
                  ? "text-[1.35rem] sm:text-3xl md:text-3xl"
                  : "text-[1.55rem] sm:text-4xl md:text-4xl"
              }`}
            >
              Baebe Boo
            </span>
          </Link>

          <nav aria-label="Primary navigation" className="hidden min-w-0 flex-1 items-center justify-center gap-4 lg:flex xl:gap-5">
            <Link href="/category/baby-clothing" className="text-xs font-semibold text-black/75 transition hover:text-black">Baby</Link>
            <Link href="/category/toys" className="text-xs font-semibold text-black/75 transition hover:text-black">Toddler & Kids</Link>
            <Link href="/category/gift-sets" className="text-xs font-semibold text-black/75 transition hover:text-black">Gifts</Link>
            <Link href="/category/clearance" className="text-xs font-semibold text-[#9b5548] transition hover:text-black">Deals</Link>
          </nav>

          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2 md:gap-2.5">
            <button type="button" onClick={() => setSearchOpen(true)} aria-label="Search products" className="hidden h-10 w-10 items-center justify-center rounded-full bg-white/80 text-black shadow-sm backdrop-blur-xl transition hover:scale-105 hover:bg-white lg:flex">
              <Search size={18} />
            </button>
            <Link href="/account" prefetch={false} aria-label="My account" className="hidden h-10 w-10 items-center justify-center rounded-full bg-white/80 text-black shadow-sm backdrop-blur-xl transition hover:scale-105 hover:bg-white lg:flex">
              <UserRound size={18} />
            </Link>
            <Link
              href="/store"
              prefetch={false}
              className={`hidden items-center rounded-full bg-white/80 px-4 text-xs font-semibold text-black shadow-sm backdrop-blur-xl transition hover:scale-105 hover:bg-white lg:flex md:px-5 md:text-sm ${
                minimized ? "h-9 md:h-10" : "h-10 md:h-12"
              }`}
            >
              Store
            </Link>

            <Link
              href="/cart"
              prefetch={false}
              aria-label={`Cart, ${liveCartCount} items`}
              className={`relative flex shrink-0 items-center justify-center overflow-visible rounded-full bg-black text-white shadow-sm transition-all duration-300 hover:scale-105 hover:bg-neutral-900 ${
                minimized
                  ? "h-10 w-12 md:h-11 md:w-12"
                  : "h-11 w-12 md:h-11 md:w-12"
              }`}
            >
              <ShoppingBag
                size={21}
                strokeWidth={2}
                className="absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 text-white"
              />

              {liveCartCount > 0 && (
                <span className="absolute -right-1 -top-1 z-20 flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-[#FFEAF2] text-[11px] font-bold leading-none text-black shadow-md">
                  {liveCartCount}
                </span>
              )}
            </Link>

            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              aria-label="Open menu"
              aria-expanded={menuOpen}
              aria-controls="site-menu"
              className={`flex items-center justify-center rounded-full bg-white/80 px-3 text-black shadow-sm backdrop-blur-xl transition hover:scale-105 hover:bg-white md:px-4 ${
                minimized ? "h-10 w-10 md:h-11 md:w-11" : "h-11 w-11 md:h-11 md:w-11"
              }`}
            >
              <Menu size={22} />
            </button>
          </div>
        </div>
      </header>

      {searchOpen && (
        <div className="storefront-search-overlay" role="dialog" aria-modal="true" aria-label="Search products" onClick={() => setSearchOpen(false)}>
          <div className="storefront-search-overlay-sheet" onClick={(event) => event.stopPropagation()}>
            <InstantSearch variant="overlay" autoFocus onNavigate={() => setSearchOpen(false)} />
          </div>
        </div>
      )}

      {cartMessage && (
        <div className="fixed left-1/2 top-20 z-[90] w-[92%] max-w-md -translate-x-1/2 rounded-3xl bg-black px-5 py-3 text-center text-sm font-semibold text-white shadow-xl sm:top-24 sm:rounded-full">
          {cartMessage}
        </div>
      )}

      {menuOpen && (
        <div
          onClick={() => setMenuOpen(false)}
          className="fixed inset-0 z-[60] bg-black/30 backdrop-blur-sm"
        />
      )}

      <aside
        id="site-menu"
        aria-hidden={!menuOpen}
        inert={!menuOpen ? true : undefined}
        className={`fixed right-0 top-0 z-[80] h-dvh w-full max-w-[390px] overflow-y-auto bg-[#FDFBF8] shadow-2xl transition-transform duration-500 sm:w-[90%] ${
          menuOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-black/10 bg-[#FDFBF8]/95 px-5 py-5 backdrop-blur-xl sm:px-6">
          <div>
            <h2 className="text-xl font-semibold">Menu</h2>
            <p className="text-sm text-black/50">Baebe Boo navigation</p>
          </div>

          <button
            type="button"
            onClick={() => setMenuOpen(false)}
            aria-label="Close menu"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-black text-white"
          >
            <X size={20} />
          </button>
        </div>

        <div className="space-y-8 px-5 py-6 sm:px-6">
          <section>
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-widest text-black/50">
              Shop
            </h3>
            <div className="space-y-3">
              <MenuLink
                href="/"
                icon={Home}
                label="Home"
                close={() => setMenuOpen(false)}
              />

              <MenuLink
                href="/store"
                icon={Store}
                label="Store"
                close={() => setMenuOpen(false)}
              />

              <MenuLink
                href="/cart"
                icon={ShoppingBag}
                label="Cart"
                close={() => setMenuOpen(false)}
              />
            </div>
          </section>

          <section>
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-widest text-black/50">
              Help &amp; discover
            </h3>
            <div className="space-y-3">
              <MenuLink
                href="/parenting"
                icon={BookOpen}
                label="Parenting Hub"
                close={() => setMenuOpen(false)}
              />

              <MenuLink
                href="/stores"
                icon={MapPin}
                label="Our Stores"
                close={() => setMenuOpen(false)}
              />

              <MenuLink
                href="/track-records"
                icon={Truck}
                label="Track order"
                close={() => setMenuOpen(false)}
              />

              <MenuLink
                href="/about"
                icon={Info}
                label="About"
                close={() => setMenuOpen(false)}
              />
            </div>
          </section>

          <section>
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-widest text-black/50">
              Account
            </h3>
            {account ? (
              <div className="space-y-3">
                <div className="rounded-2xl bg-white px-5 py-4 shadow-sm">
                  <p className="truncate font-semibold text-black">{account.name}</p>
                  {account.email && (
                    <p className="truncate text-sm text-black/50">{account.email}</p>
                  )}
                </div>

                <MenuLink
                  href="/account"
                  icon={UserRound}
                  label="My account"
                  close={() => setMenuOpen(false)}
                />

                <button
                  type="button"
                  onClick={() => void signOut()}
                  className="flex w-full items-center gap-3 rounded-2xl bg-white px-5 py-4 font-semibold text-black shadow-sm transition hover:bg-[#F8F5F0]"
                >
                  <LogOut size={21} />
                  Sign out
                </button>
              </div>
            ) : (
              <MenuLink
                href="/account/login"
                icon={UserRound}
                label="Sign in or create an account"
                close={() => setMenuOpen(false)}
              />
            )}
          </section>

          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 rounded-2xl bg-[#128C7E] px-5 py-4 font-semibold text-white"
          >
            <WhatsAppIcon size={20} />
            Chat on WhatsApp
          </a>
        </div>
      </aside>
    </>
  );
}

function MenuLink({
  href,
  icon: Icon,
  label,
  close,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  close: () => void;
}) {
  return (
    <Link
      href={href}
      prefetch={false}
      onClick={close}
      className="flex items-center gap-3 rounded-2xl bg-white px-5 py-4 font-semibold text-black shadow-sm transition hover:bg-[#F8F5F0]"
    >
      <Icon size={21} />
      {label}
    </Link>
  );
}
