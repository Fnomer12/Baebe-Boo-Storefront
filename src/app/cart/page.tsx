"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import { supabase } from "@/lib/supabase";
import {
  Minus,
  Plus,
  Trash2,
  ShoppingBag,
  MapPin,
  X,
  CreditCard,
  Phone,
  User,
  Home,
  Mail,
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
  price: number | string;
  quantity: number;
  imageUrl?: string;
  shop?: Shop;
  shopId?: string;
  stockAvailable?: number;
};

const cleanPrice = (price: number | string) => {
  if (typeof price === "number") return price;
  return Number(price.replace(/[^\d.]/g, "")) || 0;
};

export default function CartPage() {
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [message, setMessage] = useState("");

  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("+233");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [placingOrder, setPlacingOrder] = useState(false);

  useEffect(() => {
    try {
      const cart = JSON.parse(localStorage.getItem("baebe_cart") || "[]");
      setCartItems(Array.isArray(cart) ? cart : []);
    } catch {
      setCartItems([]);
    }
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

  const showMessage = (text: string) => {
    setMessage(text);

    window.dispatchEvent(
      new CustomEvent("baebe_cart_message", {
        detail: text,
      })
    );

    setTimeout(() => setMessage(""), 3000);
  };

  const updateCart = (items: CartItem[]) => {
    setCartItems(items);
    localStorage.setItem("baebe_cart", JSON.stringify(items));

    if (items.length === 0) {
      localStorage.removeItem("baebe_selected_shop");
    }

    window.dispatchEvent(new Event("baebe_cart_updated"));
  };

  const handlePhoneChange = (value: string) => {
    const digitsOnly = value.replace(/[^\d]/g, "");

    let nationalNumber = digitsOnly;

    if (nationalNumber.startsWith("233")) {
      nationalNumber = nationalNumber.slice(3);
    }

    if (nationalNumber.startsWith("0")) {
      nationalNumber = nationalNumber.slice(1);
    }

    nationalNumber = nationalNumber.slice(0, 9);

    setCustomerPhone(`+233${nationalNumber}`);
  };

  const increaseQuantity = async (id: string) => {
    const item = cartItems.find((cartItem) => cartItem.id === id);
    if (!item) return;

    const shopId = item.shop?.id || item.shopId;

    if (!shopId) {
      showMessage("Shop location not found for this item.");
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
        cartItem.id === id
          ? {
              ...cartItem,
              quantity: currentQuantity + 1,
              stockAvailable,
            }
          : cartItem
      )
    );
  };

  const decreaseQuantity = (id: string) => {
    updateCart(
      cartItems.map((item) =>
        item.id === id
          ? {
              ...item,
              quantity: Math.max(1, Number(item.quantity || 1) - 1),
            }
          : item
      )
    );
  };

  const removeItem = (id: string) => {
    updateCart(cartItems.filter((item) => item.id !== id));
  };

  const validateCheckout = () => {
    if (!customerName.trim()) {
      showMessage("Enter customer name.");
      return false;
    }

    if (!customerEmail.trim() || !customerEmail.includes("@")) {
      showMessage("Enter a valid email address.");
      return false;
    }

    if (!customerPhone.startsWith("+233") || customerPhone.length !== 13) {
      showMessage("Enter a valid Ghana number starting with +233.");
      return false;
    }

    if (!deliveryAddress.trim()) {
      showMessage("Enter delivery address.");
      return false;
    }

    if (cartItems.length === 0) {
      showMessage("Your cart is empty.");
      return false;
    }

    if (subtotal <= 0) {
      showMessage("Invalid cart total.");
      return false;
    }

    return true;
  };

 const savePaidOrder = async (
  paymentReference: string,
  cartSnapshot: CartItem[],
  totalSnapshot: number
) => {
    const orderNumber = `BB-${Date.now().toString().slice(-6)}`;

    const { data: order, error: orderError } = await supabase
      .from("orders")
      .insert({
        order_number: orderNumber,
        customer_name: customerName.trim(),
        customer_email: customerEmail.trim(),
        customer_phone: customerPhone.trim(),
        delivery_address: deliveryAddress.trim(),
       total_amount: totalSnapshot,
        order_status: "paid",
        payment_method: "paystack",
        payment_reference: paymentReference,
        payment_status: "paid",
        payment_date: new Date().toISOString(),
        order_type: "online",
      })
      .select()
      .single();

    if (orderError) {
      throw new Error(orderError.message);
    }

    const orderRows = cartSnapshot.map((item) => ({
      order_id: order.id,
      product_id: item.id,
      product_name: item.name,
      quantity: Number(item.quantity || 1),
    }));

    const { error: itemsError } = await supabase
      .from("order_items")
      .insert(orderRows);

    if (itemsError) {
      throw new Error(itemsError.message);
    }
  };

  const createOnlineOrder = async () => {
    if (!validateCheckout()) return;

    const cartSnapshot = [...cartItems];
const totalSnapshot = subtotal;

// Immediately clear the cart
updateCart([]);
setCheckoutOpen(false);

    try {
      setPlacingOrder(true);

      const initRes = await fetch("/api/paystack/initialize", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: customerEmail.trim(),
          amount: subtotal,
          name: customerName.trim(),
          phone: customerPhone.trim(),
        }),
      });

      const initData = await initRes.json();

      if (!initRes.ok || !initData.status || !initData.data?.access_code) {
        showMessage(initData.message || "Could not start Paystack payment.");
        setPlacingOrder(false);
        return;
      }

      const PaystackPop = (await import("@paystack/inline-js")).default;
      const popup = new PaystackPop();

      popup.resumeTransaction(initData.data.access_code, {
        onSuccess: async (transaction: any) => {
          try {
            const reference = transaction?.reference;

            if (!reference) {
              showMessage("Payment reference not found.");
              setPlacingOrder(false);
              return;
            }

            const verifyRes = await fetch("/api/paystack/verify", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
  reference,
  amount: totalSnapshot,
}),
            });

            const verifyData = await verifyRes.json();

            if (!verifyRes.ok || !verifyData.status) {
              showMessage(
                verifyData.message || "Payment could not be verified."
              );
              setPlacingOrder(false);
              return;
            }

           await savePaidOrder(
  reference,
  cartSnapshot,
  totalSnapshot
);

            updateCart([]);
            setCheckoutOpen(false);
            setCustomerName("");
            setCustomerEmail("");
            setCustomerPhone("+233");
            setDeliveryAddress("");
            setPlacingOrder(false);

            showMessage("Payment successful. Order sent to admin notifications.");
          } catch (error: any) {
            setPlacingOrder(false);
            showMessage(error?.message || "Could not save order.");
          }
        },

        onCancel: () => {
          setPlacingOrder(false);
          showMessage("Payment cancelled.");
        },
      });
    } catch {
      setPlacingOrder(false);
      showMessage("Something went wrong while starting Paystack.");
    }
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
                      key={item.id}
                      className="grid gap-4 rounded-[1.75rem] bg-white p-4 shadow-sm sm:grid-cols-[120px_1fr] md:grid-cols-[140px_1fr_auto] md:rounded-[2rem]"
                    >
                      <div className="aspect-square overflow-hidden rounded-2xl bg-neutral-100">
                        {item.imageUrl ? (
                          <img
                            src={item.imageUrl}
                            alt={item.name}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center bg-[#DDF2FF]">
                            <ShoppingBag size={26} className="text-black/40" />
                          </div>
                        )}
                      </div>

                      <div className="min-w-0">
                        <p className="truncate text-xs uppercase tracking-wide text-black/40">
                          {item.category}
                        </p>

                        <h2 className="mt-1 break-words text-lg font-semibold sm:text-xl">
                          {item.name}
                        </h2>

                        <p className="mt-2 text-sm text-black/50">
                          {item.ageRange || item.age} · {item.gender}
                        </p>

                        {item.shop && (
                          <p className="mt-2 flex items-start gap-1 text-xs font-semibold text-black/45">
                            <MapPin size={13} className="mt-0.5 shrink-0" />
                            <span className="break-words">{item.shop.location}</span>
                          </p>
                        )}

                        <button
                          onClick={() => removeItem(item.id)}
                          className="mt-4 flex items-center gap-2 text-sm font-semibold text-red-500"
                        >
                          <Trash2 size={16} />
                          Remove
                        </button>
                      </div>

                      <div className="flex items-center justify-between gap-4 border-t border-black/10 pt-4 sm:col-span-2 md:col-span-1 md:flex-col md:items-end md:border-t-0 md:pt-0">
                        <p className="text-lg font-semibold">
                          GH₵{(price * quantity).toLocaleString()}
                        </p>

                        <div className="flex items-center gap-3 rounded-full bg-[#F8F5F0] p-1">
                          <button
                            onClick={() => decreaseQuantity(item.id)}
                            className="flex h-9 w-9 items-center justify-center rounded-full bg-white"
                          >
                            <Minus size={15} />
                          </button>

                          <span className="w-6 text-center text-sm font-semibold">
                            {quantity}
                          </span>

                          <button
                            onClick={() => increaseQuantity(item.id)}
                            className="flex h-9 w-9 items-center justify-center rounded-full bg-black text-white"
                          >
                            <Plus size={15} />
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
                      Pickup Store
                    </p>

                    <p className="mt-2 font-semibold">{selectedShop.name}</p>
                    <p className="text-sm leading-6 text-black/50">
                      {selectedShop.location}
                    </p>
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

               <button
  onClick={() => setCheckoutOpen(true)}
  disabled={placingOrder}
  className="shimmer-btn mt-6 h-14 w-full rounded-full bg-black text-sm font-semibold text-white shadow-lg transition hover:scale-[1.02] hover:bg-neutral-900 disabled:opacity-50"
>
  <span className="relative z-10 text-white">
    Proceed to Checkout
  </span>
</button>
              </aside>
            </div>
          )}
        </div>
      </section>

      {checkoutOpen && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/35 px-3 py-3 backdrop-blur-md sm:items-center sm:px-4">
          <div className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-[1.75rem] border border-white/40 bg-white/90 p-4 shadow-2xl backdrop-blur-xl sm:rounded-[2rem] sm:p-6">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-black/40 sm:tracking-[0.2em]">
                  Online Checkout
                </p>
                <h2 className="mt-1 text-2xl font-semibold">
                  Delivery Details
                </h2>
                <p className="mt-1 text-sm leading-6 text-black/50">
                  Pay online and your order will go to admin notifications.
                </p>
              </div>

              <button
                onClick={() => {
                  if (!placingOrder) setCheckoutOpen(false);
                }}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-black text-white"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4">
              <InputIcon icon={<User size={18} />} input={
                <input
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Customer name"
                  className="h-14 w-full rounded-full border border-black/10 bg-white/90 pl-12 pr-5 outline-none"
                />
              } />

              <InputIcon icon={<Mail size={18} />} input={
                <input
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  placeholder="Customer email"
                  type="email"
                  className="h-14 w-full rounded-full border border-black/10 bg-white/90 pl-12 pr-5 outline-none"
                />
              } />

              <InputIcon icon={<Phone size={18} />} input={
                <input
                  value={customerPhone}
                  onChange={(e) => handlePhoneChange(e.target.value)}
                  placeholder="+233 phone number"
                  className="h-14 w-full rounded-full border border-black/10 bg-white/90 pl-12 pr-5 outline-none"
                />
              } />

              <div className="relative">
                <Home size={18} className="absolute left-5 top-5 text-black/40" />
                <textarea
                  value={deliveryAddress}
                  onChange={(e) => setDeliveryAddress(e.target.value)}
                  placeholder="Delivery address"
                  className="min-h-28 w-full resize-none rounded-3xl border border-black/10 bg-white/90 px-12 py-4 outline-none"
                />
              </div>

              <div className="rounded-3xl bg-white/90 p-5">
                <div className="mb-3 flex items-center gap-2">
                  <CreditCard size={18} />
                  <p className="text-sm font-semibold">Payment Method</p>
                </div>

                <div className="rounded-2xl border border-black bg-black px-4 py-3 text-sm font-semibold text-white">
                  Paystack Online Payment
                </div>

                <div className="mt-5 flex justify-between gap-4 border-t border-black/10 pt-4 text-lg font-bold">
                  <span>Total</span>
                  <span>GH₵{subtotal.toLocaleString()}</span>
                </div>
              </div>

              <button
                onClick={createOnlineOrder}
                disabled={placingOrder}
                className="h-14 w-full rounded-full bg-black text-sm font-semibold text-white disabled:opacity-50"
              >
                {placingOrder ? "Processing Payment..." : "Pay Online"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function InputIcon({
  icon,
  input,
}: {
  icon: React.ReactNode;
  input: React.ReactNode;
}) {
  return (
    <div className="relative">
      <div className="absolute left-5 top-1/2 -translate-y-1/2 text-black/40">
        {icon}
      </div>
      {input}
    </div>
  );
}