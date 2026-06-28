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

      <section className="px-4 pb-20 pt-32 md:px-6">
        <div className="mx-auto max-w-7xl space-y-12">
          <section className="hero-gradient relative overflow-hidden rounded-[2.5rem] px-6 py-16 shadow-sm md:px-16 md:py-24">
            <div className="absolute -left-16 top-10 h-72 w-72 rounded-full bg-[#FFEAF2]/80 blur-3xl" />
            <div className="absolute -right-20 bottom-8 h-80 w-80 rounded-full bg-[#8DDCFF]/70 blur-3xl" />

            <div className="relative mx-auto max-w-4xl text-center">
              <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-white/80 shadow-sm backdrop-blur">
                <Baby size={32} />
              </div>

              <p className="mb-4 text-sm font-semibold uppercase tracking-[0.25em] text-black/45">
                Premium Baby & Children Store
              </p>

              <h1 className="text-4xl font-semibold leading-tight md:text-7xl">
                Everything Your Little One Needs,
                <br />
                All In One Trusted Place
              </h1>

              <p className="mx-auto mt-6 max-w-2xl text-base leading-8 text-black/60 md:text-lg">
                Clothing, shoes, toys, feeding essentials, nursery items and
                gifts carefully selected for babies and children.
              </p>

             <div className="mt-9 flex justify-center">
            <Link
              href="/store"
              className="inline-flex items-center justify-center rounded-full bg-black px-12 py-4 text-sm font-semibold text-white shadow-lg transition-all duration-300 hover:scale-105 hover:bg-neutral-900"
            >
              Shop Now
            </Link>
          </div>
            </div>
          </section>

          <section className="grid gap-3 rounded-[2rem] bg-white/80 p-4 shadow-sm backdrop-blur md:grid-cols-3 lg:grid-cols-6">
            {trustItems.map((item) => (
              <div
                key={item}
                className="flex items-center justify-center gap-2 rounded-2xl bg-[#F8F5F0] px-4 py-4 text-center text-sm font-medium"
              >
                <CheckCircle2 size={17} />
                {item}
              </div>
            ))}
          </section>

          <div className="grid gap-6 lg:grid-cols-2">
            <ProductSection title="Best Sellers" products={bestSellers} loading={loading} />
            <ProductSection title="New Arrivals" products={newArrivals} loading={loading} />
          </div>

          <section className="rounded-[2rem] bg-white/80 p-6 shadow-sm backdrop-blur">
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
                  <p className="mt-4 text-sm font-semibold">Verified Customer</p>
                </div>
              ))}
            </div>
          </section>

          <div className="grid gap-6 lg:grid-cols-2">
            <section className="rounded-[2.5rem] bg-white/80 p-8 shadow-sm backdrop-blur">
              <p className="mb-2 text-sm font-semibold uppercase tracking-[0.2em] text-black/40">
                Visit Us
              </p>

              <h2 className="text-3xl font-semibold">Find Our Store</h2>

              <p className="mt-2 max-w-xl text-black/60">
                Visit Baebe Boo for baby clothing, shoes, toys, gifts and
                parenting essentials.
              </p>

              <div className="mt-6 max-h-[420px] overflow-y-auto pr-2">
                <div className="space-y-3">
                  {shops.length === 0 ? (
                    <div className="rounded-3xl bg-[#F8F5F0] p-5 text-sm text-black/50">
                      No shop locations available yet.
                    </div>
                  ) : (
                    shops.map((shop) => (
                      <div
                        key={shop.id}
                        className="flex items-center gap-4 rounded-3xl border border-black/10 bg-[#F8F5F0] p-5"
                      >
                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-black text-white">
                          <MapPin size={22} />
                        </div>

                        <div>
                          <p className="font-semibold">{shop.name}</p>
                          <p className="text-sm text-black/50">{shop.location}</p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </section>

            <section className="rounded-[2.5rem] bg-white/80 p-8 shadow-sm backdrop-blur">
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
                        className={`flex h-12 w-12 items-center justify-center rounded-full ${post.bg}`}
                      >
                        <Icon size={22} />
                      </div>

                      <div>
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
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-lg transition hover:scale-105"
      >
        <MessageCircle size={26} />
      </a>

      <style jsx>{`
        .hero-gradient {
          background: linear-gradient(
            120deg,
            #ffeaf2,
            #ddf2ff,
            #f3eaff,
            #c7f0ff,
            #ffeaf2
          );
          background-size: 400% 400%;
          animation: baebeGradient 12s ease infinite;
        }

        @keyframes baebeGradient {
          0% {
            background-position: 0% 50%;
          }
          50% {
            background-position: 100% 50%;
          }
          100% {
            background-position: 0% 50%;
          }
        }
      `}</style>
    </main>
  );
}

function SectionHeader({ label, title }: { label: string; title: string }) {
  return (
    <div className="mb-6">
      <p className="mb-2 text-sm font-semibold uppercase tracking-[0.2em] text-black/40">
        {label}
      </p>
      <h2 className="text-3xl font-semibold md:text-4xl">{title}</h2>
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
    <section className="rounded-[2rem] bg-white/80 p-6 shadow-sm backdrop-blur">
      <div className="mb-6 flex items-end justify-between gap-4">
        <SectionHeader label="Featured" title={title} />

        <Link href="/store" className="text-sm font-semibold text-blue-600">
          View All →
        </Link>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map((item) => (
            <div
              key={item}
              className="h-48 animate-pulse rounded-2xl bg-[#F8F5F0]"
            />
          ))}
        </div>
      ) : products.length === 0 ? (
        <div className="rounded-2xl bg-[#F8F5F0] p-6 text-sm text-black/50">
          No products available yet.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-4">
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

              <div className="p-4">
                <p className="mb-1 text-[11px] uppercase tracking-wide text-black/40">
                  {product.category}
                </p>
                <h3 className="line-clamp-2 text-sm font-semibold leading-5">
                  {product.name}
                </h3>
                <p className="mt-2 text-sm font-semibold">GH₵{product.price}</p>
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

    if (!parentName || !childFirstName || !childLastName || !phone || !email || !childDob) {
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
    <section className="rounded-[2.5rem] bg-white/80 p-8 shadow-sm backdrop-blur">
      <SectionHeader label="Membership" title="Become a Member" />

      <p className="mb-6 max-w-2xl text-sm leading-7 text-black/60">
        Join Baebe Boo membership for special updates, child-focused offers and birthday surprises.
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
          className="h-14 rounded-full border border-black/10 bg-white px-5 outline-none"
        />

        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="Phone number"
          className="h-14 rounded-full border border-black/10 bg-white px-5 outline-none"
        />

        <input
          value={email}
          type="email"
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email address"
          className="h-14 rounded-full border border-black/10 bg-white px-5 outline-none"
        />

        <div>
          <label className="mb-2 block text-sm font-semibold text-black">
            Child&apos;s Date of Birth
          </label>

          <input
            value={childDob}
            onChange={(e) => setChildDob(e.target.value)}
            type="date"
            className="h-14 w-full rounded-full border border-black/10 bg-white px-5 outline-none"
          />
        </div>

        <input
          value={childFirstName}
          onChange={(e) => setChildFirstName(e.target.value)}
          placeholder="Child's first name"
          className="h-14 rounded-full border border-black/10 bg-white px-5 outline-none"
        />

        <input
          value={childLastName}
          onChange={(e) => setChildLastName(e.target.value)}
          placeholder="Child's last name"
          className="h-14 rounded-full border border-black/10 bg-white px-5 outline-none"
        />

        <button
          disabled={saving}
          className="mt-2 h-14 rounded-full bg-black px-8 text-sm font-semibold text-white disabled:opacity-50 md:col-span-2"
        >
          {saving ? "Submitting..." : "Become a Member"}
        </button>
      </form>
    </section>
  );
}