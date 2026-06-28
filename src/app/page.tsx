"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import { supabase } from "@/lib/supabase";
import {
  Baby,
  CheckCircle2,
  MessageCircle,
  Star,
  HeartHandshake,
  Apple,
  ShoppingBag,
  MapPin,
} from "lucide-react";

type Product = {
  id: string;
  name: string;
  imageUrl: string;
  price: string;
  category: string;
};

type Shop = {
  id: string;
  name: string;
  location: string;
};

const trustItems = [
  "Authentic Products",
  "Secure Payments",
  "Nationwide Delivery",
  "Easy Returns",
  "Trusted by Ghanaian Families",
  "Fast Support",
];

const blogPosts = [
  {
    title: "Newborn Care",
    text: "Helpful tips for parents.",
    icon: HeartHandshake,
    bg: "bg-[#FFEAF2]",
  },
  {
    title: "Child Nutrition",
    text: "Healthy feeding guidance.",
    icon: Apple,
    bg: "bg-[#E8F8E8]",
  },
  {
    title: "Product Guides",
    text: "Choose the right baby items.",
    icon: ShoppingBag,
    bg: "bg-[#DDF2FF]",
  },
];

const whatsappUrl =
  "https://wa.me/233XXXXXXXXX?text=Hello%20Baebe%20Boo%2C%20I%20would%20like%20to%20make%20an%20enquiry.";

export default function Home() {
  const [bestSellers, setBestSellers] = useState<Product[]>([]);
  const [newArrivals, setNewArrivals] = useState<Product[]>([]);
  const [shops, setShops] = useState<Shop[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchHomeProducts = async () => {
      setLoading(true);

      const { data, error } = await supabase
        .from("products")
        .select("id, name, price, category, image_url, created_at, is_active")
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(8);

      if (error) {
        console.error(error.message);
        setLoading(false);
        return;
      }

      const mappedProducts: Product[] = (data || []).map((product: any) => ({
        id: product.id,
        name: product.name,
        price: String(product.price),
        category: product.category || "",
        imageUrl: product.image_url || "",
      }));

      setNewArrivals(mappedProducts.slice(0, 4));
      setBestSellers(
        mappedProducts.slice(4, 8).length
          ? mappedProducts.slice(4, 8)
          : mappedProducts.slice(0, 4)
      );

      setLoading(false);
    };

    fetchHomeProducts();
  }, []);

  useEffect(() => {
    const fetchShops = async () => {
      const { data, error } = await supabase
        .from("shops")
        .select("id, name, location")
        .eq("is_active", true)
        .order("created_at", { ascending: true });

      if (error) {
        console.error(error.message);
        return;
      }

      setShops(data || []);
    };

    fetchShops();
  }, []);

  return (
    <main className="min-h-screen bg-[#F8F5F0] text-black">
      <Navbar cartCount={0} />

      <section className="px-3 pb-12 pt-36 sm:px-4 sm:pb-16 sm:pt-36 md:px-6 md:pt-40">
        <div className="mx-auto w-full max-w-7xl space-y-8 sm:space-y-10 md:space-y-12">
          <section className="hero-gradient relative overflow-hidden rounded-[1.75rem] px-4 py-14 shadow-sm sm:rounded-[2rem] sm:px-8 sm:py-16 md:rounded-[2.5rem] md:px-16 md:py-24">
            <div className="absolute -left-16 top-10 h-48 w-48 rounded-full bg-[#FFEAF2]/80 blur-3xl sm:h-72 sm:w-72" />
            <div className="absolute -right-20 bottom-8 h-56 w-56 rounded-full bg-[#8DDCFF]/70 blur-3xl sm:h-80 sm:w-80" />

            <div className="relative mx-auto max-w-4xl text-center">
              <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-white/80 shadow-sm backdrop-blur sm:h-16 sm:w-16">
                <Baby size={30} />
              </div>

              <p className="mb-4 text-xs font-semibold uppercase tracking-[0.18em] text-black/45 sm:text-sm sm:tracking-[0.25em]">
                Premium Baby & Children Store
              </p>

              <h1 className="text-[2.45rem] font-semibold leading-[1.05] tracking-tight sm:text-5xl md:text-6xl lg:text-7xl">
                Everything Your Little One Needs,
                <br className="hidden sm:block" />
                <span className="sm:ml-2">All In One Trusted Place</span>
              </h1>

              <p className="mx-auto mt-5 max-w-2xl text-sm leading-7 text-black/60 sm:text-base md:text-lg md:leading-8">
                Clothing, shoes, toys, feeding essentials, nursery items and
                gifts carefully selected for babies and children.
              </p>

              <div className="mt-8 flex justify-center">
                <Link
                  href="/store"
                  style={{
                    backgroundColor: "#050505",
                    color: "#ffffff",
                  }}
                  className="inline-flex w-full max-w-xs items-center justify-center rounded-full px-10 py-4 text-sm font-semibold shadow-lg transition-all duration-300 hover:scale-105 sm:w-auto sm:max-w-none sm:px-12"
                >
                  Shop Now
                </Link>
              </div>
            </div>
          </section>

          <section className="grid grid-cols-1 gap-3 rounded-[1.5rem] bg-white/80 p-3 shadow-sm backdrop-blur sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 lg:rounded-[2rem] lg:p-4">
            {trustItems.map((item) => (
              <div
                key={item}
                className="flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-[#F8F5F0] px-4 py-3 text-center text-sm font-medium"
              >
                <CheckCircle2 size={17} className="shrink-0" />
                <span>{item}</span>
              </div>
            ))}
          </section>

          <div className="grid gap-6 lg:grid-cols-2">
            <ProductSection
              title="Best Sellers"
              products={bestSellers}
              loading={loading}
            />

            <ProductSection
              title="New Arrivals"
              products={newArrivals}
              loading={loading}
            />
          </div>

          <section className="rounded-[1.75rem] bg-white/80 p-4 shadow-sm backdrop-blur sm:p-6 md:rounded-[2rem]">
            <SectionHeader label="Reviews" title="Trusted by Ghanaian Families" />

            <div className="grid gap-4 md:grid-cols-3">
              {[
                "Beautiful quality and fast delivery. I trust Baebe Boo for my baby essentials.",
                "The items feel premium and the service was very helpful.",
                "Very neat packaging and lovely products for children.",
              ].map((review) => (
                <div
                  key={review}
                  className="rounded-[1.5rem] border border-black/5 bg-white p-5 shadow-sm"
                >
                  <div className="mb-4 flex gap-1 text-yellow-500">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <Star key={star} size={16} fill="currentColor" />
                    ))}
                  </div>

                  <p className="text-sm leading-7 text-black/60">{review}</p>

                  <p className="mt-4 text-sm font-semibold">
                    Verified Customer
                  </p>
                </div>
              ))}
            </div>
          </section>

          <div className="grid gap-6 lg:grid-cols-2">
            <section className="rounded-[1.75rem] bg-white/80 p-4 shadow-sm backdrop-blur sm:p-6 md:rounded-[2.5rem] md:p-8">
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-black/40 sm:text-sm sm:tracking-[0.2em]">
                Visit Us
              </p>

              <h2 className="text-2xl font-semibold sm:text-3xl">
                Find Our Store
              </h2>

              <p className="mt-2 max-w-xl text-sm leading-7 text-black/60 sm:text-base">
                Visit Baebe Boo for baby clothing, shoes, toys, gifts and
                parenting essentials.
              </p>

              <div className="mt-6 max-h-[420px] overflow-y-auto pr-1 sm:pr-2">
                <div className="space-y-3">
                  {shops.length === 0 ? (
                    <div className="rounded-3xl bg-[#F8F5F0] p-5 text-sm text-black/50">
                      No shop locations available yet.
                    </div>
                  ) : (
                    shops.map((shop) => (
                      <div
                        key={shop.id}
                        className="flex items-start gap-4 rounded-3xl border border-black/10 bg-[#F8F5F0] p-4 sm:items-center sm:p-5"
                      >
                        <div
                          style={{
                            backgroundColor: "#050505",
                            color: "#ffffff",
                          }}
                          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full sm:h-12 sm:w-12"
                        >
                          <MapPin size={21} color="#ffffff" />
                        </div>

                        <div className="min-w-0">
                          <p className="break-words font-semibold">
                            {shop.name}
                          </p>
                          <p className="break-words text-sm leading-6 text-black/50">
                            {shop.location}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </section>

            <section className="rounded-[1.75rem] bg-white/80 p-4 shadow-sm backdrop-blur sm:p-6 md:rounded-[2.5rem] md:p-8">
              <SectionHeader label="Guides" title="Parenting Hub" />

              <div className="grid gap-3">
                {blogPosts.map((post) => {
                  const Icon = post.icon;

                  return (
                    <div
                      key={post.title}
                      className="flex items-center gap-4 rounded-2xl bg-[#F8F5F0] p-4"
                    >
                      <div
                        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full sm:h-12 sm:w-12 ${post.bg}`}
                      >
                        <Icon size={22} />
                      </div>

                      <div className="min-w-0">
                        <p className="font-semibold">{post.title}</p>
                        <p className="text-sm text-black/50">{post.text}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>

          <MemberSection />
        </div>
      </section>

      <a
        href={whatsappUrl}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Chat on WhatsApp"
        className="fixed bottom-4 right-4 z-50 flex h-13 w-13 items-center justify-center rounded-full bg-[#25D366] text-white shadow-lg transition hover:scale-105 sm:bottom-6 sm:right-6 sm:h-14 sm:w-14"
      >
        <MessageCircle size={26} color="#ffffff" />
      </a>
    </main>
  );
}

function SectionHeader({ label, title }: { label: string; title: string }) {
  return (
    <div className="mb-5 sm:mb-6">
      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-black/40 sm:text-sm sm:tracking-[0.2em]">
        {label}
      </p>

      <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl md:text-4xl">
        {title}
      </h2>
    </div>
  );
}

function ProductSection({
  title,
  products,
  loading,
}: {
  title: string;
  products: Product[];
  loading: boolean;
}) {
  return (
    <section className="rounded-[1.75rem] bg-white/80 p-4 shadow-sm backdrop-blur sm:p-6 md:rounded-[2rem]">
      <div className="mb-6 flex items-start justify-between gap-4">
        <SectionHeader label="Featured" title={title} />

        <Link
          href="/store"
          className="shrink-0 pt-1 text-sm font-semibold text-blue-600"
        >
          View All →
        </Link>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map((item) => (
            <div
              key={item}
              className="h-44 animate-pulse rounded-2xl bg-[#F8F5F0] sm:h-48"
            />
          ))}
        </div>
      ) : products.length === 0 ? (
        <div className="rounded-2xl bg-[#F8F5F0] p-6 text-sm text-black/50">
          No products available yet.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
          {products.map((product) => (
            <Link
              href="/store"
              key={`${title}-${product.id}`}
              className="group overflow-hidden rounded-2xl bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-md"
            >
              <div className="aspect-square overflow-hidden bg-gradient-to-br from-[#FFEAF2] to-[#DDF2FF]">
                {product.imageUrl ? (
                  <img
                    src={product.imageUrl}
                    alt={product.name}
                    className="h-full w-full object-cover transition group-hover:scale-105"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/70">
                      <Baby size={22} className="text-black/45" />
                    </div>
                  </div>
                )}
              </div>

              <div className="p-3 sm:p-4">
                <p className="mb-1 truncate text-[10px] uppercase tracking-wide text-black/40 sm:text-[11px]">
                  {product.category}
                </p>

                <h3 className="line-clamp-2 text-sm font-semibold leading-5">
                  {product.name}
                </h3>

                <p className="mt-2 text-sm font-semibold">
                  GH₵{product.price}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

function MemberSection() {
  const [parentName, setParentName] = useState("");
  const [childFirstName, setChildFirstName] = useState("");
  const [childLastName, setChildLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [childDob, setChildDob] = useState("");
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");

  const submitMembership = async (e: React.FormEvent) => {
    e.preventDefault();
    setSuccess("");
    setError("");

    if (
      !parentName ||
      !childFirstName ||
      !childLastName ||
      !phone ||
      !email ||
      !childDob
    ) {
      setError("Please fill all fields.");
      return;
    }

    try {
      setSaving(true);

      const { error } = await supabase.from("members").insert({
        parent_name: parentName.trim(),
        child_first_name: childFirstName.trim(),
        child_last_name: childLastName.trim(),
        phone: phone.trim(),
        email: email.trim(),
        child_date_of_birth: childDob,
      });

      if (error) {
        setError(error.message);
        return;
      }

      setSuccess("Membership submitted successfully.");
      setParentName("");
      setChildFirstName("");
      setChildLastName("");
      setPhone("");
      setEmail("");
      setChildDob("");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-[1.75rem] bg-white/80 p-4 shadow-sm backdrop-blur sm:p-6 md:rounded-[2.5rem] md:p-8">
      <SectionHeader label="Membership" title="Become a Member" />

      <p className="mb-6 max-w-2xl text-sm leading-7 text-black/60">
        Join Baebe Boo membership for special updates, child-focused offers and
        birthday surprises.
      </p>

      {error && (
        <div className="mb-4 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      )}

      {success && (
        <div className="mb-4 rounded-2xl bg-green-50 px-4 py-3 text-sm text-green-600">
          {success}
        </div>
      )}

      <form onSubmit={submitMembership} className="grid gap-4 md:grid-cols-2">
        <input
          value={parentName}
          onChange={(e) => setParentName(e.target.value)}
          placeholder="Your full name"
          className="h-14 w-full rounded-full border border-black/10 bg-white px-5 outline-none"
        />

        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="Phone number"
          className="h-14 w-full rounded-full border border-black/10 bg-white px-5 outline-none"
        />

        <input
          value={email}
          type="email"
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email address"
          className="h-14 w-full rounded-full border border-black/10 bg-white px-5 outline-none"
        />

       <div className="w-full">
  <label className="mb-2 block text-sm font-semibold text-black">
    Child&apos;s Date of Birth
  </label>

  <input
    value={childDob}
    onChange={(e) => setChildDob(e.target.value)}
    type="date"
    className="h-14 w-full rounded-full border border-black/10 bg-white px-5 text-sm text-black/70 outline-none"
  />
</div>

        <input
          value={childFirstName}
          onChange={(e) => setChildFirstName(e.target.value)}
          placeholder="Child's first name"
          className="h-14 w-full rounded-full border border-black/10 bg-white px-5 outline-none"
        />

        <input
          value={childLastName}
          onChange={(e) => setChildLastName(e.target.value)}
          placeholder="Child's last name"
          className="h-14 w-full rounded-full border border-black/10 bg-white px-5 outline-none"
        />

        <button
          disabled={saving}
          type="submit"
          style={{
            backgroundColor: "#050505",
            color: "#ffffff",
          }}
          className="mt-2 h-14 w-full rounded-full px-8 text-sm font-semibold disabled:opacity-50 md:col-span-2"
        >
          {saving ? "Submitting..." : "Become a Member"}
        </button>
      </form>
    </section>
  );
}