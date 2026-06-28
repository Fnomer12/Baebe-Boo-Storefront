"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import { supabase } from "@/lib/supabase";
import { Search, Baby, MapPin } from "lucide-react";

type FilterValues = {
  gender: string;
  category: string;
  age: string;
};

type Shop = {
  id: string;
  name: string;
  location: string;
};

type Product = {
  id: string;
  name: string;
  category: string;
  age: string;
  gender: string;
  price: string;
  imageUrl: string;
  shopIds: string[];
  stockByShop: Record<string, number>;
};

export default function StorePage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [shops, setShops] = useState<Shop[]>([]);
  const [selectedShop, setSelectedShop] = useState<Shop | null>(null);

  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [cartCount, setCartCount] = useState(0);

  const [filters, setFilters] = useState<FilterValues>({
    gender: "All",
    category: "All Categories",
    age: "All Ages",
  });

  const refreshCartCount = () => {
    const cart = JSON.parse(localStorage.getItem("baebe_cart") || "[]");

    const count = cart.reduce(
      (sum: number, item: any) => sum + Number(item.quantity || 0),
      0
    );

    setCartCount(count);
  };

  useEffect(() => {
    const savedShop = localStorage.getItem("baebe_selected_shop");
    const cart = JSON.parse(localStorage.getItem("baebe_cart") || "[]");

    if (cart.length > 0 && cart[0]?.shop) {
      setSelectedShop(cart[0].shop);
      localStorage.setItem("baebe_selected_shop", JSON.stringify(cart[0].shop));
    } else if (savedShop) {
      setSelectedShop(JSON.parse(savedShop));
    }

    refreshCartCount();

    window.addEventListener("baebe_cart_updated", refreshCartCount);
    window.addEventListener("storage", refreshCartCount);

    return () => {
      window.removeEventListener("baebe_cart_updated", refreshCartCount);
      window.removeEventListener("storage", refreshCartCount);
    };
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

  useEffect(() => {
    const fetchProducts = async () => {
      setLoading(true);

      const { data, error } = await supabase
        .from("products")
        .select(`
          id,
          name,
          category,
          age_range,
          gender,
          price,
          image_url,
          is_active,
          product_shop_availability (
            shop_id,
            is_available,
            stock_quantity
          )
        `)
        .eq("is_active", true)
        .order("created_at", { ascending: false });

      if (error) {
        console.error(error.message);
        setLoading(false);
        return;
      }

      setProducts(
        (data || []).map((product: any) => {
          const availability = product.product_shop_availability || [];

          return {
            id: product.id,
            name: product.name || "",
            category: product.category || "",
            age: product.age_range || "",
            gender: product.gender || "",
            price: `GH₵${product.price}`,
            imageUrl: product.image_url || "",

            shopIds: availability
              .filter(
                (row: any) =>
                  row.is_available && Number(row.stock_quantity || 0) > 0
              )
              .map((row: any) => row.shop_id),

            stockByShop: availability.reduce((acc: any, row: any) => {
              acc[row.shop_id] = Number(row.stock_quantity || 0);
              return acc;
            }, {}),
          };
        })
      );

      setLoading(false);
    };

    fetchProducts();
  }, []);

  const chooseShop = (shop: Shop) => {
    setSelectedShop(shop);
    localStorage.setItem("baebe_selected_shop", JSON.stringify(shop));
  };

  const changeShop = () => {
    const cart = JSON.parse(localStorage.getItem("baebe_cart") || "[]");

    if (cart.length > 0) {
      alert("Please remove all items from your cart before changing shop.");
      return;
    }

    localStorage.removeItem("baebe_selected_shop");
    setSelectedShop(null);
  };

  const addToCart = (product: Product) => {
    if (!selectedShop) {
      alert("Please select your closest store first.");
      return;
    }

    const stockAvailable = product.stockByShop[selectedShop.id] || 0;

    const cart = JSON.parse(localStorage.getItem("baebe_cart") || "[]");

    const existing = cart.find((item: any) => item.id === product.id);
    const existingQuantity = Number(existing?.quantity || 0);

    if (existingQuantity >= stockAvailable) {
     window.dispatchEvent(
  new CustomEvent("baebe_cart_message", {
    detail: `Can't add ${product.name} again. Stock limit reached for ${selectedShop.location}.`,
  })
);
return;
    }

    const cartProduct = {
      id: product.id,
      name: product.name,
      category: product.category,
      age: product.age,
      gender: product.gender,
      price: product.price,
      imageUrl: product.imageUrl,
      quantity: 1,
      shop: selectedShop,
      shopId: selectedShop.id,
    };

    const updatedCart = existing
      ? cart.map((item: any) =>
          item.id === product.id
            ? { ...item, quantity: Number(item.quantity || 1) + 1 }
            : item
        )
      : [...cart, cartProduct];

    localStorage.setItem("baebe_cart", JSON.stringify(updatedCart));
    localStorage.setItem("baebe_selected_shop", JSON.stringify(selectedShop));

    window.dispatchEvent(new Event("baebe_cart_updated"));
    refreshCartCount();
  };

  const shopProducts = selectedShop
    ? products.filter((product) => product.shopIds.includes(selectedShop.id))
    : [];

  const filteredProducts = shopProducts.filter((product) => {
    const searchMatch = product.name
      .toLowerCase()
      .includes(search.toLowerCase());

    const genderMatch =
      filters.gender === "All" || product.gender === filters.gender;

    const categoryMatch =
      filters.category === "All Categories" ||
      product.category === filters.category;

    const ageMatch = filters.age === "All Ages" || product.age === filters.age;

    return searchMatch && genderMatch && categoryMatch && ageMatch;
  });

  return (
    <main className="min-h-screen bg-[#F8F5F0] text-black">
      <Navbar cartCount={cartCount} onFilterChange={setFilters} />

      {!selectedShop && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 px-4 backdrop-blur-md">
          <div className="w-full max-w-2xl rounded-[2rem] border border-white/40 bg-white/75 p-8 shadow-2xl backdrop-blur-xl">
            <p className="text-sm font-semibold uppercase tracking-[0.25em] text-black/40">
              Select Store Location
            </p>

            <h2 className="mt-3 text-3xl font-semibold">
              Choose the shop closest to you
            </h2>

            <p className="mt-2 text-sm text-black/50">
              Products will show based on the store location you select.
            </p>

            <div className="mt-6 grid gap-3 md:grid-cols-2">
              {shops.map((shop) => (
                <button
                  key={shop.id}
                  onClick={() => chooseShop(shop)}
                  className="rounded-3xl border border-white/60 bg-white/80 p-5 text-left shadow-sm backdrop-blur-lg transition hover:-translate-y-1 hover:bg-black hover:text-white"
                >
                  <p className="font-semibold">{shop.name}</p>
                  <p className="mt-1 text-sm opacity-60">{shop.location}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <section className="px-4 pb-20 pt-32 md:px-6">
        <div className="mx-auto max-w-7xl">
          <div className="mb-8 flex items-start justify-between gap-4">
            <div>
              <p className="mb-2 text-sm font-medium uppercase tracking-[0.2em] text-black/40">
                Baebe Boo Store
              </p>

              <h1 className="text-4xl font-semibold md:text-6xl">
                Shop Baby Essentials
              </h1>

              <p className="mt-3 max-w-xl text-black/60">
                Browse clothing, shoes, toys, feeding essentials, nursery items
                and gifts carefully selected for babies and children.
              </p>

              {selectedShop && (
                <div className="mt-5 inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold shadow-sm">
                  <MapPin size={16} />
                  Shopping from {selectedShop.location}

                  <button
                    onClick={changeShop}
                    className="ml-3 rounded-full bg-black px-3 py-1 text-xs font-semibold text-white"
                  >
                    Change Shop
                  </button>
                </div>
              )}
            </div>

            <Link
              href="/"
              className="shrink-0 rounded-full bg-white px-5 py-3 text-sm font-semibold text-black shadow-sm transition hover:bg-black hover:text-white"
            >
              &lt; Back
            </Link>
          </div>

          <div className="mb-8 flex max-w-md items-center gap-3 rounded-full bg-white px-5 py-3 shadow-sm">
            <Search size={18} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search products..."
              className="w-full bg-transparent text-sm outline-none"
            />
          </div>

          {loading ? (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
              {[1, 2, 3, 4, 5, 6, 7, 8].map((item) => (
                <div
                  key={item}
                  className="h-72 animate-pulse rounded-[2rem] bg-white"
                />
              ))}
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="rounded-[2rem] bg-white p-10 text-center shadow-sm">
              <h2 className="text-2xl font-semibold">No products found</h2>
              <p className="mt-2 text-black/50">
                Try changing your search, filters or shop location.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
              {filteredProducts.map((product) => (
                <div
                  key={product.id}
                  className="overflow-hidden rounded-[2rem] bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-md"
                >
                  <div className="aspect-square overflow-hidden bg-neutral-100">
                    {product.imageUrl ? (
                      <img
                        src={product.imageUrl}
                        alt={product.name}
                        className="h-full w-full object-cover transition hover:scale-105"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center">
                        <Baby size={34} className="text-black/30" />
                      </div>
                    )}
                  </div>

                  <div className="p-4">
                    <p className="text-xs uppercase tracking-wide text-black/40">
                      {product.category}
                    </p>

                    <h3 className="mt-1 font-medium">{product.name}</h3>

                    <p className="mt-1 text-xs text-black/40">
                      {product.age} · {product.gender}
                    </p>

                    <div className="mt-4 flex items-center justify-between">
                      <p className="font-semibold">{product.price}</p>

                      <button
                        onClick={() => addToCart(product)}
                        className="rounded-full bg-black px-4 py-2 text-xs font-medium text-white"
                      >
                        Add
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}