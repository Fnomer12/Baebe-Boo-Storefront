"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Cormorant_Garamond } from "next/font/google";
import {
  Menu,
  SlidersHorizontal,
  ShoppingBag,
  X,
  Baby,
  Crown,
  Rainbow,
  Shirt,
  Footprints,
  Sprout,
  ToyBrick,
  Milk,
  Gift,
  Bed,
  School,
  Heart,
  Home,
  Store,
  MessageCircle,
  Truck,
} from "lucide-react";

const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const genders = [
  { name: "All", icon: ToyBrick },
  { name: "Boys", icon: Baby },
  { name: "Girls", icon: Crown },
  { name: "Unisex", icon: Rainbow },
];

const categories = [
  { name: "All Categories", icon: ToyBrick },
  { name: "Baby Clothing", icon: Shirt },
  { name: "Baby Shoes", icon: Footprints },
  { name: "Feeding", icon: Milk },
  { name: "Toys", icon: ToyBrick },
  { name: "School Essentials", icon: School },
  { name: "Nursery", icon: Bed },
  { name: "Gift Sets", icon: Gift },
  { name: "Maternity", icon: Heart },
  { name: "Accessories", icon: Sprout },
];

const ages = [
  "All Ages",
  "0–3 Months",
  "3–6 Months",
  "6–12 Months",
  "1–2 Years",
  "2–4 Years",
  "4–6 Years",
  "6+ Years",
];

type FilterValues = {
  gender: string;
  category: string;
  age: string;
};

type NavbarProps = {
  cartCount?: number;
  onFilterChange?: (filters: FilterValues) => void;
};

export default function Navbar({ cartCount = 0, onFilterChange }: NavbarProps) {
  const pathname = usePathname();
  const showFilters = pathname === "/store";

  const [liveCartCount, setLiveCartCount] = useState(cartCount);
  const [cartMessage, setCartMessage] = useState("");

  const [flipped, setFlipped] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);

  const [selectedGender, setSelectedGender] = useState("All");
  const [selectedCategory, setSelectedCategory] = useState("All Categories");
  const [selectedAge, setSelectedAge] = useState("All Ages");

  useEffect(() => {
    const updateCartCount = () => {
      const cart = JSON.parse(localStorage.getItem("baebe_cart") || "[]");

      const total = cart.reduce(
        (sum: number, item: any) => sum + Number(item.quantity || 0),
        0
      );

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

    return () => {
      window.removeEventListener("baebe_cart_message", showMessage);
    };
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setFlipped((prev) => !prev);
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      setMinimized(window.scrollY > 40);
    };

    handleScroll();
    window.addEventListener("scroll", handleScroll);

    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const applyFilters = () => {
    onFilterChange?.({
      gender: selectedGender,
      category: selectedCategory,
      age: selectedAge,
    });

    setFiltersOpen(false);
  };

  const clearFilters = () => {
    setSelectedGender("All");
    setSelectedCategory("All Categories");
    setSelectedAge("All Ages");

    onFilterChange?.({
      gender: "All",
      category: "All Categories",
      age: "All Ages",
    });

    setFiltersOpen(false);
  };

  return (
    <>
      <header className="fixed left-0 top-0 z-50 w-full px-2 pt-2 sm:px-3 sm:pt-3 md:px-4 md:pt-4">
        <div
          className={`mx-auto flex max-w-7xl items-center justify-between rounded-full border border-white/50 bg-white/50 shadow-lg shadow-black/5 backdrop-blur-2xl transition-all duration-500 ${
            minimized
              ? "h-14 px-2 sm:px-3 md:h-16 md:px-4"
              : "h-16 px-2 sm:h-[72px] sm:px-3 md:h-24 md:px-5"
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
                  : "h-11 w-11 sm:h-12 sm:w-12 md:h-16 md:w-16"
              }`}
            >
              <Image
                src="/baebe-boo.jpg"
                alt="Baebe Boo baby store"
                fill
                className="object-cover"
                priority
              />
            </div>

            <div
              className={`min-w-0 [perspective:1200px] transition-all duration-500 ${
                minimized
                  ? "h-10 w-[115px] sm:w-[150px] md:h-12 md:w-[190px]"
                  : "h-11 w-[135px] sm:h-12 sm:w-[180px] md:h-16 md:w-[260px]"
              }`}
            >
              <div
                className={`relative h-full w-full transition-transform duration-1000 [transform-style:preserve-3d] ${
                  flipped ? "[transform:rotateX(-180deg)]" : ""
                }`}
              >
                <div className="absolute inset-0 flex items-center overflow-hidden [backface-visibility:hidden]">
                  <h1
                    className={`${cormorant.className} truncate whitespace-nowrap font-semibold tracking-tight text-black transition-all duration-500 ${
                      minimized
                        ? "text-[1.45rem] sm:text-3xl md:text-4xl"
                        : "text-[1.7rem] sm:text-4xl md:text-5xl"
                    }`}
                  >
                    Baebe Boo
                  </h1>
                </div>

                <div className="absolute inset-0 flex items-center overflow-hidden [transform:rotateX(180deg)] [backface-visibility:hidden]">
                  <h1
                    className={`${cormorant.className} truncate whitespace-nowrap font-semibold tracking-tight text-black transition-all duration-500 ${
                      minimized
                        ? "text-[1.45rem] sm:text-3xl md:text-4xl"
                        : "text-[1.7rem] sm:text-4xl md:text-5xl"
                    }`}
                  >
                    Storefront
                  </h1>
                </div>
              </div>
            </div>
          </Link>

          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2 md:gap-3">
            <Link
              href="/store"
              className={`hidden items-center rounded-full bg-white/80 px-4 text-xs font-semibold text-black shadow-sm backdrop-blur-xl transition hover:scale-105 hover:bg-white sm:flex md:px-5 md:text-sm ${
                minimized ? "h-9 md:h-10" : "h-10 md:h-12"
              }`}
            >
              Store
            </Link>

            {showFilters && (
              <button
                onClick={() => setFiltersOpen(true)}
                className={`flex items-center justify-center gap-2 rounded-full bg-[#DDF2FF]/95 px-3 text-black shadow-sm backdrop-blur-xl transition hover:scale-105 md:px-4 ${
                  minimized ? "h-9" : "h-10 md:h-12"
                }`}
              >
                <SlidersHorizontal size={19} />
                <span className="hidden text-xs font-semibold md:inline md:text-sm">
                  Filter
                </span>
              </button>
            )}

            <Link
              href="/cart"
              aria-label="Cart"
              className={`relative flex shrink-0 items-center justify-center overflow-visible rounded-full bg-black text-white shadow-sm transition-all duration-300 hover:scale-105 hover:bg-neutral-900 ${
                minimized
                  ? "h-10 w-12 md:h-11 md:w-14"
                  : "h-11 w-14 md:h-12 md:w-16"
              }`}
            >
              <ShoppingBag
                size={21}
                strokeWidth={2}
                className="absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 text-white"
              />

              <span className="absolute -right-1 -top-1 z-20 flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-[#FFEAF2] text-[11px] font-bold leading-none text-black shadow-md">
                {liveCartCount}
              </span>
            </Link>

            <button
              onClick={() => setMenuOpen(true)}
              aria-label="Open menu"
              className={`flex items-center justify-center rounded-full bg-white/80 px-3 text-black shadow-sm backdrop-blur-xl transition hover:scale-105 hover:bg-white md:px-4 ${
                minimized ? "h-10 md:h-11" : "h-11 md:h-12"
              }`}
            >
              <Menu size={22} />
            </button>
          </div>
        </div>
      </header>

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
            onClick={() => setMenuOpen(false)}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-black text-white"
          >
            <X size={20} />
          </button>
        </div>

        <div className="space-y-3 px-5 py-6 sm:px-6">
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

          <MenuLink
            href="/track-records"
            icon={Truck}
            label="Track Records"
            close={() => setMenuOpen(false)}
          />

          <a
            href="https://wa.me/233XXXXXXXXX"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 rounded-2xl bg-[#25D366] px-5 py-4 font-semibold text-white"
          >
            <MessageCircle size={21} />
            Chat on WhatsApp
          </a>
        </div>
      </aside>

      {showFilters && filtersOpen && (
        <div
          onClick={() => setFiltersOpen(false)}
          className="fixed inset-0 z-[60] bg-black/30 backdrop-blur-sm"
        />
      )}

      {showFilters && (
        <aside
          className={`fixed right-0 top-0 z-[70] h-dvh w-full max-w-[430px] overflow-y-auto bg-[#FDFBF8] shadow-2xl transition-transform duration-500 sm:w-[90%] ${
            filtersOpen ? "translate-x-0" : "translate-x-full"
          }`}
        >
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-black/10 bg-[#FDFBF8]/95 px-5 py-5 backdrop-blur-xl md:px-6">
            <div>
              <h2 className="text-xl font-semibold text-black">Filters</h2>
              <p className="text-sm text-black/50">
                Find the perfect baby item
              </p>
            </div>

            <button
              onClick={() => setFiltersOpen(false)}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-black text-white"
            >
              <X size={20} />
            </button>
          </div>

          <div className="space-y-8 px-5 py-6 md:px-6">
            <div>
              <h3 className="mb-4 text-sm font-semibold uppercase tracking-widest text-black/50">
                Shop By
              </h3>

              <div className="grid grid-cols-2 gap-3">
                {genders.map((item) => {
                  const Icon = item.icon;
                  const active = selectedGender === item.name;

                  return (
                    <button
                      key={item.name}
                      onClick={() => setSelectedGender(item.name)}
                      className={`flex min-w-0 items-center gap-3 rounded-2xl border px-4 py-4 text-left transition ${
                        active
                          ? "border-black bg-[#DDF2FF] text-black"
                          : "border-black/10 bg-white text-black/60"
                      }`}
                    >
                      <Icon size={21} className="shrink-0" />
                      <span className="truncate font-medium">{item.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <h3 className="mb-4 text-sm font-semibold uppercase tracking-widest text-black/50">
                Categories
              </h3>

              <div className="space-y-3">
                {categories.map((item) => {
                  const Icon = item.icon;
                  const active = selectedCategory === item.name;

                  return (
                    <button
                      key={item.name}
                      onClick={() => setSelectedCategory(item.name)}
                      className={`flex w-full items-center justify-between gap-3 rounded-2xl border px-4 py-4 transition ${
                        active
                          ? "border-black bg-black text-white"
                          : "border-black/10 bg-white text-black"
                      }`}
                    >
                      <span className="flex min-w-0 items-center gap-3">
                        <Icon size={21} className="shrink-0" />
                        <span className="truncate font-medium">
                          {item.name}
                        </span>
                      </span>

                      {active && (
                        <span className="shrink-0 text-xs">Selected</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <h3 className="mb-4 text-sm font-semibold uppercase tracking-widest text-black/50">
                Age Range
              </h3>

              <div className="flex flex-wrap gap-3">
                {ages.map((age) => {
                  const active = selectedAge === age;

                  return (
                    <button
                      key={age}
                      onClick={() => setSelectedAge(age)}
                      className={`rounded-full border px-5 py-3 text-sm font-medium transition ${
                        active
                          ? "border-black bg-black text-white"
                          : "border-black/10 bg-white text-black/60"
                      }`}
                    >
                      {age}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="sticky bottom-0 grid grid-cols-2 gap-3 border-t border-black/10 bg-[#FDFBF8]/95 py-4 backdrop-blur-xl">
              <button
                onClick={clearFilters}
                className="h-14 rounded-full border border-black/10 bg-white text-sm font-semibold text-black"
              >
                Clear
              </button>

              <button
                onClick={applyFilters}
                className="shimmer-hover h-14 rounded-full bg-black text-sm font-semibold text-white"
              >
                <span className="relative z-10 text-white">Apply Filters</span>
              </button>
            </div>
          </div>
        </aside>
      )}
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
  icon: any;
  label: string;
  close: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={close}
      className="flex items-center gap-3 rounded-2xl bg-white px-5 py-4 font-semibold text-black shadow-sm transition hover:bg-[#F8F5F0]"
    >
      <Icon size={21} />
      {label}
    </Link>
  );
}