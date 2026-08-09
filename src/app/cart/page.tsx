"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import Navbar from "@/components/Navbar";
import { cartLineOptionSummary, cartLineSignature } from "@/domain/catalog/cart-line-options";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import {
  Minus,
  Plus,
  Trash2,
  ShoppingBag,
  MapPin,
} from "lucide-react";

type Shop = {
  id: string;
  name: string;
  location: string;
};

type CartItem = {
  id: string;
  name: string;
  category: string;
  age?: string;
  ageRange?: string;
  gender: string;
  /** The chosen value per option. Lines saved before this shipped have none. */
  optionValues?: Record<string, string>;
  /** @deprecated The pre-variable-products shape, still read for one release. */
  color?: string;
  /** @deprecated See `color`. */
  size?: string;
  price: number | string;
  quantity: number;
  variantId?: string;
  imageUrl?: string;
  shop?: Shop;
  shopId?: string;
  stockAvailable?: number;
  fulfilment?: "national" | "branch";
};

const cleanPrice = (price: number | string) => {
  if (typeof price === "number") return price;
  return Number(price.replace(/[^\d.]/g, "")) || 0;
};

// One key for both generations of cart line, and for products with a third
// option the old colour/size key could not tell apart at all.
const cartItemKey = (item: CartItem) => cartLineSignature(item);

export default function CartPage() {
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [message, setMessage] = useState("");


  const showMessage = useCallback((text: string) => {
    setMessage(text);
    setTimeout(() => setMessage(""), 3000);
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      try {
        const cart: unknown = JSON.parse(localStorage.getItem("baebe_cart") || "[]");
        setCartItems(Array.isArray(cart) ? cart : []);
      } catch {
        setCartItems([]);
      }
    });
  }, []);

  const selectedShop = cartItems[0]?.shop || null;

  const subtotal = cartItems.reduce(
    (total, item) => total + cleanPrice(item.price) * Number(item.quantity || 1),
    0
  );

  const cartCount = cartItems.reduce(
    (sum, item) => sum + Number(item.quantity || 1),
    0
  );

  const updateCart = (items: CartItem[]) => {
    setCartItems(items);
    localStorage.setItem("baebe_cart", JSON.stringify(items));

    if (items.length === 0) {
      localStorage.removeItem("baebe_selected_shop");
    }

    window.dispatchEvent(new Event("baebe_cart_updated"));
  };

  const increaseQuantity = async (lineKey: string) => {
    const item = cartItems.find((cartItem) => cartItemKey(cartItem) === lineKey);
    if (!item) return;

    const shopId = item.shop?.id || item.shopId;

    if (!shopId) {
      const currentQuantity = Number(item.quantity || 1);
      if (currentQuantity >= 100) {
        showMessage("Maximum cart quantity reached. Final stock is confirmed at checkout.");
        return;
      }
      updateCart(
        cartItems.map((cartItem) =>
          cartItemKey(cartItem) === lineKey ? { ...cartItem, quantity: currentQuantity + 1 } : cartItem,
        ),
      );
      return;
    }

    if (!isSupabaseConfigured) {
      const currentQuantity = Number(item.quantity || 1);
      const limit = item.stockAvailable || 100;
      if (currentQuantity >= limit) {
        showMessage(`Only ${limit} available for this demo branch.`);
        return;
      }
      updateCart(cartItems.map((cartItem) => cartItemKey(cartItem) === lineKey ? { ...cartItem, quantity: currentQuantity + 1 } : cartItem));
      return;
    }

    const { data, error } = await supabase
      .from("product_shop_availability")
      .select("stock_quantity")
      .eq("product_id", item.id)
      .eq("shop_id", shopId)
      .eq("is_available", true)
      .maybeSingle();

    if (error) {
      showMessage(error.message);
      return;
    }

    const stockAvailable = Number(data?.stock_quantity || 0);
    const currentQuantity = Number(item.quantity || 1);

    if (currentQuantity >= stockAvailable) {
      showMessage(
        `Can't add ${item.name} again. Only ${stockAvailable} available in ${
          item.shop?.location || "this shop"
        }.`
      );
      return;
    }

    updateCart(
      cartItems.map((cartItem) =>
        cartItemKey(cartItem) === lineKey
          ? {
              ...cartItem,
              quantity: currentQuantity + 1,
              stockAvailable,
            }
          : cartItem
      )
    );
  };

  const decreaseQuantity = (lineKey: string) => {
    updateCart(
      cartItems.map((item) =>
        cartItemKey(item) === lineKey
          ? {
              ...item,
              quantity: Math.max(1, Number(item.quantity || 1) - 1),
            }
          : item
      )
    );
  };

  const removeItem = (lineKey: string) => {
    updateCart(cartItems.filter((item) => cartItemKey(item) !== lineKey));
  };

  return (
    <main className="min-h-screen bg-[#F8F5F0] text-black">
      <Navbar cartCount={cartCount} />

      {message && (
        <div className="fixed left-1/2 top-20 z-[90] w-[92%] max-w-md -translate-x-1/2 rounded-3xl bg-black px-5 py-3 text-center text-sm font-semibold text-white shadow-xl sm:top-24 sm:rounded-full">
          {message}
        </div>
      )}

      <section className="px-3 pb-12 pt-24 sm:px-4 sm:pb-16 sm:pt-28 md:px-6 md:pt-32">
        <div className="mx-auto w-full max-w-7xl">
          <div className="mb-8">
            <p className="mb-2 text-xs font-medium uppercase tracking-[0.18em] text-black/40 sm:text-sm sm:tracking-[0.2em]">
              Shopping Cart
            </p>

            <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl md:text-6xl">
              Your Cart
            </h1>

            <p className="mt-3 text-sm leading-7 text-black/60 sm:text-base">
              Review your selected items before checkout.
            </p>

            {selectedShop && (
              <div className="mt-5 inline-flex max-w-full items-start gap-3 rounded-3xl border border-black/10 bg-white px-4 py-3 shadow-sm sm:items-center sm:rounded-full sm:px-5">
                <MapPin size={18} className="mt-0.5 shrink-0 sm:mt-0" />
                <span className="break-words text-sm font-semibold">
                  Shopping from {selectedShop.location}
                </span>
              </div>
            )}
            {!selectedShop && cartItems.length > 0 && (
              <div className="mt-5 inline-flex max-w-full items-start gap-3 rounded-3xl border border-sky-200 bg-sky-50 px-4 py-3 shadow-sm sm:items-center sm:rounded-full sm:px-5">
                <MapPin size={18} className="mt-0.5 shrink-0 text-sky-700 sm:mt-0" />
                <span className="break-words text-sm font-semibold">Nationwide fulfilment · best branch selected securely at checkout</span>
              </div>
            )}
          </div>

          {cartItems.length === 0 ? (
            <div className="rounded-[1.75rem] bg-white p-8 text-center shadow-sm sm:p-12 md:rounded-[2.5rem]">
              <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-[#DDF2FF]">
                <ShoppingBag size={30} />
              </div>

              <h2 className="text-2xl font-semibold">Your cart is empty</h2>

              <Link
  href="/store"
  className="shimmer-btn mt-6 inline-flex rounded-full bg-black px-8 py-4 text-sm font-semibold text-white shadow-lg transition hover:scale-[1.02] hover:bg-neutral-900"
>
  <span className="relative z-10 text-white">
    Continue Shopping
  </span>
</Link>
            </div>
          ) : (
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
              <div className="space-y-4">
                {cartItems.map((item) => {
                  const price = cleanPrice(item.price);
                  const quantity = Number(item.quantity || 1);

                  return (
                   <div
  key={cartItemKey(item)}
  className="relative rounded-[2rem] bg-white p-4 shadow-sm md:grid md:grid-cols-[180px_1fr_180px] md:gap-6 md:p-6"
>
  <div className="grid grid-cols-[115px_1fr] gap-4 md:contents">
    <div className="aspect-square overflow-hidden rounded-[1.5rem] bg-neutral-100 md:h-[170px] md:w-[170px]">
      {item.imageUrl ? (
        <Image
          src={item.imageUrl}
          alt={item.name}
          width={340}
          height={340}
          unoptimized
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-[#DDF2FF]">
          <ShoppingBag size={26} className="text-black/40" />
        </div>
      )}
    </div>

    <div className="min-w-0">
      <p className="text-xs uppercase tracking-wide text-black/40">
        {item.category}
      </p>

      <h2 className="mt-1 text-xl font-semibold leading-tight md:text-2xl">
        {item.name}
      </h2>

      <p className="mt-3 text-sm text-black/50 md:text-base">
        {item.ageRange || item.age} · {item.gender}
      </p>
      {cartLineOptionSummary(item) && (
        <p className="mt-2 text-sm font-semibold text-black/60">
          {cartLineOptionSummary(item)}
        </p>
      )}

      {item.shop && (
        <p className="mt-3 flex items-center gap-1 text-sm font-semibold text-black/45">
          <MapPin size={15} />
          {item.shop.location}
        </p>
      )}

      <button
        onClick={() => removeItem(cartItemKey(item))}
        className="mt-5 flex items-center gap-2 text-sm font-semibold text-red-500 md:text-base"
      >
        <Trash2 size={17} />
        Remove
      </button>
    </div>
  </div>

  <div className="mt-5 flex items-center justify-between border-t border-black/10 pt-4 md:mt-0 md:flex-col md:items-end md:border-t-0 md:pt-0">
    <p className="text-xl font-bold md:text-2xl">
      GH₵{(price * quantity).toLocaleString()}
    </p>

    <div className="flex items-center gap-4 rounded-full bg-[#F8F5F0] p-1.5">
      <button
        onClick={() => decreaseQuantity(cartItemKey(item))}
        aria-label={`Decrease quantity of ${item.name}`}
        className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-black shadow-sm"
      >
        <Minus size={17} />
      </button>

      <span className="w-6 text-center text-base font-bold">
        {quantity}
      </span>

      <button
        onClick={() => increaseQuantity(cartItemKey(item))}
        aria-label={`Increase quantity of ${item.name}`}
        className="flex h-11 w-11 items-center justify-center rounded-full bg-black text-white shadow-sm"
      >
        <Plus size={18} />
      </button>
    </div>
  </div>
</div>
                  );
                })}
              </div>

              <aside className="h-fit rounded-[1.75rem] bg-white p-5 shadow-sm sm:p-6 md:rounded-[2.5rem] lg:sticky lg:top-28">
                <h2 className="text-2xl font-semibold">Order Summary</h2>

                {selectedShop && (
                  <div className="mt-5 rounded-3xl bg-[#F8F5F0] p-4">
                    <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-black/40">
                      <MapPin size={14} />
                      Preferred branch
                    </p>

                    <p className="mt-2 font-semibold">{selectedShop.name}</p>
                    <p className="text-sm leading-6 text-black/50">
                      {selectedShop.location}
                    </p>
                  </div>
                )}
                {!selectedShop && (
                  <div className="mt-5 rounded-3xl bg-[#DDF2FF] p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-black/40">Smart fulfilment</p>
                    <p className="mt-2 text-sm leading-6 text-black/60">We reserve stock from the fewest branches possible. Any split delivery is shown before payment.</p>
                  </div>
                )}

                <div className="mt-6 space-y-4 text-sm">
                  <div className="flex justify-between gap-4">
                    <span className="text-black/50">Subtotal</span>
                    <span className="font-semibold">
                      GH₵{subtotal.toLocaleString()}
                    </span>
                  </div>

                  <div className="border-t border-black/10 pt-4">
                    <div className="flex justify-between gap-4 text-lg">
                      <span className="font-semibold">Total</span>
                      <span className="font-semibold">
                        GH₵{subtotal.toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>

                <Link
                  href="/checkout"
                  className="shimmer-btn mt-6 flex h-14 w-full items-center justify-center rounded-full bg-black text-sm font-semibold text-white shadow-lg transition hover:scale-[1.02] hover:bg-neutral-900"
                >
                  <span className="relative z-10 text-white">
                    Proceed to Checkout
                  </span>
                </Link>
              </aside>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
