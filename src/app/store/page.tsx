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
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/20 px-3 py-3 backdrop-blur-md sm:items-center sm:px-4">
          <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-[1.75rem] border border-white/40 bg-white/85 p-5 shadow-2xl backdrop-blur-xl sm:rounded-[2rem] sm:p-8">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-black/40 sm:text-sm sm:tracking-[0.25em]">
              Select Store Location
            </p>

            <h2 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
              Choose the shop closest to you
            </h2>

            <p className="mt-2 text-sm leading-6 text-black/50">
              Products will show based on the store location you select.
            </p>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {shops.length === 0 ? (
                <div className="rounded-3xl bg-[#F8F5F0] p-5 text-sm text-black/50 sm:col-span-2">
                  No shop locations available yet.
                </div>
              ) : (
                shops.map((shop) => (
                  <button
                    key={shop.id}
                    onClick={() => chooseShop(shop)}
                    className="rounded-3xl border border-white/60 bg-white/80 p-5 text-left shadow-sm backdrop-blur-lg transition hover:-translate-y-1 hover:bg-black hover:text-white"
                  >
                    <p className="font-semibold">{shop.name}</p>
                    <p className="mt-1 text-sm leading-6 opacity-60">
                      {shop.location}
                    </p>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      <section className="px-3 pb-12 pt-24 sm:px-4 sm:pb-16 sm:pt-28 md:px-6 md:pt-32">
        <div className="mx-auto w-full max-w-7xl">
          <div className="mb-8 flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="mb-2 text-xs font-medium uppercase tracking-[0.18em] text-black/40 sm:text-sm sm:tracking-[0.2em]">
                Baebe Boo Store
              </p>

              <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl md:text-6xl">
                Shop Baby Essentials
              </h1>

              <p className="mt-3 max-w-xl text-sm leading-7 text-black/60 sm:text-base">
                Browse clothing, shoes, toys, feeding essentials, nursery items
                and gifts carefully selected for babies and children.
              </p>

              {selectedShop && (
                <div className="mt-5 flex w-full flex-col gap-3 rounded-3xl bg-white p-3 text-sm font-semibold shadow-sm sm:inline-flex sm:w-auto sm:flex-row sm:items-center sm:rounded-full sm:px-4 sm:py-2">
                  <div className="flex min-w-0 items-start gap-2 sm:items-center">
                    <MapPin size={16} className="mt-0.5 shrink-0 sm:mt-0" />
                    <span className="break-words">
                      Shopping from {selectedShop.location}
                    </span>
                  </div>

                  <button
                    onClick={changeShop}
                    className="rounded-full bg-black px-4 py-2 text-xs font-semibold text-white sm:ml-2 sm:px-3 sm:py-1"
                  >
                    Change Shop
                  </button>
                </div>
              )}
            </div>

           
          </div>

          <div className="mb-8 flex w-full max-w-md items-center gap-3 rounded-full bg-white px-5 py-3 shadow-sm">
            <Search size={18} className="shrink-0" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search products..."
              className="w-full min-w-0 bg-transparent text-sm outline-none"
            />
          </div>

          {loading ? (
            <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
              {[1, 2, 3, 4, 5, 6, 7, 8].map((item) => (
                <div
                  key={item}
                  className="h-64 animate-pulse rounded-[1.75rem] bg-white sm:h-72 sm:rounded-[2rem]"
                />
              ))}
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="rounded-[1.75rem] bg-white p-8 text-center shadow-sm sm:p-10 md:rounded-[2rem]">
              <h2 className="text-2xl font-semibold">No products found</h2>
              <p className="mt-2 text-sm leading-6 text-black/50 sm:text-base">
                Try changing your search, filters or shop location.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
              {filteredProducts.map((product) => (
                <div
                  key={product.id}
                  className="overflow-hidden rounded-[1.5rem] bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-md sm:rounded-[2rem]"
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

                  <div className="p-3 sm:p-4">
                    <p className="truncate text-[10px] uppercase tracking-wide text-black/40 sm:text-xs">
                      {product.category}
                    </p>

                    <h3 className="mt-1 line-clamp-2 text-sm font-semibold leading-5 sm:text-base">
                      {product.name}
                    </h3>

                    <p className="mt-1 truncate text-[11px] text-black/40 sm:text-xs">
                      {product.age} · {product.gender}
                    </p>

                    <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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