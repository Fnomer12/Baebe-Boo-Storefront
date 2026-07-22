"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import Navbar from "@/components/Navbar";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
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

type DeliveryZone = {
  id: string;
  name: string;
  baseFee: number;
  freeDeliveryThreshold: number | null;
  estimatedDaysMin: number | null;
  estimatedDaysMax: number | null;
};

type CheckoutQuote = {
  subtotal: number;
  discount: number;
  deliveryFee: number;
  total: number;
  promotionMessage: string | null;
  promotionApplied: boolean;
  promotionCodeValid: boolean;
  split: boolean;
  shipmentCount: number;
};

type CartItem = {
  id: string;
  name: string;
  category: string;
  age?: string;
  ageRange?: string;
  gender: string;
  color?: string;
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

const cartItemKey = (item: CartItem) =>
  [item.id, item.variantId || item.color || "default", item.size || "", item.shopId || item.shop?.id || "national"].join(":");

export default function CartPage() {
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [message, setMessage] = useState("");

  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("+233");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [placingOrder, setPlacingOrder] = useState(false);
  const [fulfilmentType, setFulfilmentType] = useState<"delivery" | "pickup">("delivery");
  const [deliveryZones, setDeliveryZones] = useState<DeliveryZone[]>([]);
  const [shops, setShops] = useState<Shop[]>([]);
  const [deliveryZoneId, setDeliveryZoneId] = useState("");
  const [pickupShopId, setPickupShopId] = useState("");
  const [checkoutOptionsLoading, setCheckoutOptionsLoading] = useState(false);
  const [promotionInput, setPromotionInput] = useState("");
  const [appliedPromotionCode, setAppliedPromotionCode] = useState("");
  const [quoteRevision, setQuoteRevision] = useState(0);
  const [quote, setQuote] = useState<CheckoutQuote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const checkoutDialogRef = useRef<HTMLDivElement>(null);
  const checkoutTriggerRef = useRef<HTMLButtonElement>(null);
  const placingOrderRef = useRef(placingOrder);

  useEffect(() => {
    placingOrderRef.current = placingOrder;
  }, [placingOrder]);

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

  useEffect(() => {
    if (!checkoutOpen) return;
    if (!isSupabaseConfigured) return;
    const controller = new AbortController();
    const loadOptions = async () => {
      setCheckoutOptionsLoading(true);
      try {
        const response = await fetch("/api/checkout/options", { signal: controller.signal });
        const result = await response.json();
        if (!response.ok || !result.status) throw new Error(result.message);
        const nextZones = (result.deliveryZones || []) as DeliveryZone[];
        const nextShops = (result.shops || []) as Shop[];
        setDeliveryZones(nextZones);
        setShops(nextShops);
        setDeliveryZoneId((current) => current || nextZones[0]?.id || "");
        setPickupShopId((current) => current || selectedShop?.id || nextShops[0]?.id || "");
      } catch (error: unknown) {
        if (!controller.signal.aborted) {
          showMessage(error instanceof Error ? error.message : "Checkout options are unavailable.");
        }
      } finally {
        if (!controller.signal.aborted) setCheckoutOptionsLoading(false);
      }
    };
    void loadOptions();
    return () => controller.abort();
  }, [checkoutOpen, selectedShop?.id, showMessage]);

  useEffect(() => {
    if (!checkoutOpen) return;
    const checkoutTrigger = checkoutTriggerRef.current;
    const focusFrame = window.requestAnimationFrame(() => {
      checkoutDialogRef.current
        ?.querySelector<HTMLElement>("button:not([disabled]), input:not([disabled]), select:not([disabled])")
        ?.focus();
    });
    const handleDialogKeys = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !placingOrderRef.current) {
        setCheckoutOpen(false);
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(
        checkoutDialogRef.current?.querySelectorAll<HTMLElement>(
          "button:not([disabled]), input:not([disabled]), select:not([disabled]), a[href]",
        ) ?? [],
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", handleDialogKeys);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      window.removeEventListener("keydown", handleDialogKeys);
      checkoutTrigger?.focus();
    };
  }, [checkoutOpen]);

  useEffect(() => {
    if (
      !checkoutOpen ||
      checkoutOptionsLoading ||
      (fulfilmentType === "delivery" && !deliveryZoneId) ||
      (fulfilmentType === "pickup" && !pickupShopId)
    ) return;
    const controller = new AbortController();
    const loadQuote = async () => {
      setQuoteLoading(true);
      try {
        const response = await fetch("/api/checkout/quote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            items: cartItems.map((item) => ({
              productId: item.id,
              variantId: item.variantId,
              quantity: Number(item.quantity || 1),
            })),
            fulfilmentType,
            deliveryZoneId: fulfilmentType === "delivery" ? deliveryZoneId : undefined,
            shopId: fulfilmentType === "pickup" ? pickupShopId : undefined,
            preferredShopId: fulfilmentType === "delivery" ? selectedShop?.id : undefined,
            promotionCode: appliedPromotionCode || undefined,
          }),
        });
        const result = await response.json();
        if (!response.ok || !result.status) throw new Error(result.message);
        setQuote(result.data as CheckoutQuote);
      } catch (error: unknown) {
        if (!controller.signal.aborted) {
          setQuote(null);
          showMessage(error instanceof Error ? error.message : "Could not calculate checkout pricing.");
        }
      } finally {
        if (!controller.signal.aborted) setQuoteLoading(false);
      }
    };
    void loadQuote();
    return () => controller.abort();
  }, [
    appliedPromotionCode,
    cartItems,
    checkoutOpen,
    checkoutOptionsLoading,
    deliveryZoneId,
    fulfilmentType,
    pickupShopId,
    quoteRevision,
    selectedShop?.id,
    showMessage,
  ]);

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

    if (fulfilmentType === "delivery" && !deliveryZoneId) {
      showMessage("Choose a delivery zone.");
      return false;
    }

    if (fulfilmentType === "delivery" && !deliveryAddress.trim()) {
      showMessage("Enter delivery address.");
      return false;
    }

    if (fulfilmentType === "pickup" && !pickupShopId) {
      showMessage("Choose a collection branch.");
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

    if (!quote) {
      showMessage("Wait for the secure checkout total to finish loading.");
      return false;
    }

    return true;
  };

  const createOnlineOrder = async () => {
    if (!validateCheckout()) return;

    const cartSnapshot = [...cartItems];

    try {
      setPlacingOrder(true);

      const initRes = await fetch("/api/paystack/initialize", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: customerEmail.trim(),
          name: customerName.trim(),
          phone: customerPhone.trim(),
          deliveryAddress: deliveryAddress.trim(),
          fulfilmentType,
          deliveryZoneId: fulfilmentType === "delivery" ? deliveryZoneId : undefined,
          shopId: fulfilmentType === "pickup" ? pickupShopId : undefined,
          preferredShopId: fulfilmentType === "delivery" ? selectedShop?.id : undefined,
          promotionCode: appliedPromotionCode || undefined,
          items: cartSnapshot.map((item) => ({
            productId: item.id,
            variantId: item.variantId,
            quantity: Number(item.quantity || 1),
          })),
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
        onSuccess: async (transaction: { reference?: string }) => {
          try {
            const reference = transaction?.reference || initData.data.reference;

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
                  orderId: initData.data.order_id,
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

            updateCart([]);
            setCheckoutOpen(false);
            setCustomerName("");
            setCustomerEmail("");
            setCustomerPhone("+233");
            setDeliveryAddress("");
            setPromotionInput("");
            setAppliedPromotionCode("");
            setQuote(null);
            setPlacingOrder(false);

            showMessage("Payment successful. Order sent to admin notifications.");
          } catch (error: unknown) {
            setPlacingOrder(false);
            showMessage(error instanceof Error ? error.message : "Could not save order.");
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
      <div aria-hidden={checkoutOpen} inert={checkoutOpen ? true : undefined}>
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
      {(item.color || item.size) && (
        <p className="mt-2 text-sm font-semibold text-black/60">
          {[item.color, item.size].filter(Boolean).join(" · ")}
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

               <button
  ref={checkoutTriggerRef}
  onClick={() => {
    setCheckoutOpen(true);
    if (!isSupabaseConfigured) {
      showMessage("Checkout options are temporarily unavailable.");
    }
  }}
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
      </div>

      {checkoutOpen && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/35 px-3 py-3 backdrop-blur-md sm:items-center sm:px-4">
          <div ref={checkoutDialogRef} role="dialog" aria-modal="true" aria-labelledby="checkout-title" className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-[1.75rem] border border-white/40 bg-white/90 p-4 shadow-2xl backdrop-blur-xl sm:rounded-[2rem] sm:p-6">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-black/40 sm:tracking-[0.2em]">
                  Online Checkout
                </p>
                <h2 id="checkout-title" className="mt-1 text-2xl font-semibold">
                  Delivery Details
                </h2>
                <p className="mt-1 text-sm leading-6 text-black/50">
                  Pay online and your order will go to admin notifications.
                </p>
              </div>

              <button
                aria-label="Close checkout"
                onClick={() => {
                  if (!placingOrder) setCheckoutOpen(false);
                }}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-black text-white"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4">
              <fieldset className="rounded-3xl border border-black/10 bg-white/90 p-4">
                <legend className="px-2 text-sm font-semibold">How would you like your order?</legend>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setFulfilmentType("delivery")}
                    className={`rounded-2xl border px-3 py-3 text-left text-sm font-semibold transition ${
                      fulfilmentType === "delivery"
                        ? "border-black bg-black text-white"
                        : "border-black/10 bg-white text-black"
                    }`}
                  >
                    Delivery
                    <span className={`mt-1 block text-xs font-normal ${fulfilmentType === "delivery" ? "text-white/65" : "text-black/50"}`}>
                      Nationwide to your address
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setFulfilmentType("pickup")}
                    className={`rounded-2xl border px-3 py-3 text-left text-sm font-semibold transition ${
                      fulfilmentType === "pickup"
                        ? "border-black bg-black text-white"
                        : "border-black/10 bg-white text-black"
                    }`}
                  >
                    Click & collect
                    <span className={`mt-1 block text-xs font-normal ${fulfilmentType === "pickup" ? "text-white/65" : "text-black/50"}`}>
                      No delivery charge
                    </span>
                  </button>
                </div>

                <label className="mt-4 block text-xs font-semibold uppercase tracking-[0.14em] text-black/45" htmlFor="fulfilment-location">
                  {fulfilmentType === "delivery" ? "Delivery zone" : "Collection branch"}
                </label>
                <select
                  id="fulfilment-location"
                  value={fulfilmentType === "delivery" ? deliveryZoneId : pickupShopId}
                  onChange={(event) =>
                    fulfilmentType === "delivery"
                      ? setDeliveryZoneId(event.target.value)
                      : setPickupShopId(event.target.value)
                  }
                  disabled={checkoutOptionsLoading}
                  className="mt-2 h-12 w-full rounded-full border border-black/10 bg-white px-4 text-sm outline-none disabled:opacity-50"
                >
                  <option value="">
                    {checkoutOptionsLoading ? "Loading options…" : "Choose an option"}
                  </option>
                  {fulfilmentType === "delivery"
                    ? deliveryZones.map((zone) => (
                        <option key={zone.id} value={zone.id}>
                          {zone.name} · GH₵{zone.baseFee.toLocaleString()}
                          {zone.estimatedDaysMin !== null
                            ? ` · ${zone.estimatedDaysMin}-${zone.estimatedDaysMax ?? zone.estimatedDaysMin} days`
                            : ""}
                        </option>
                      ))
                    : shops.map((shop) => (
                        <option key={shop.id} value={shop.id}>
                          {shop.name} · {shop.location}
                        </option>
                      ))}
                </select>
              </fieldset>

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

              {fulfilmentType === "delivery" && (
                <div className="relative">
                  <Home size={18} className="absolute left-5 top-5 text-black/40" />
                  <textarea
                    value={deliveryAddress}
                    onChange={(e) => setDeliveryAddress(e.target.value)}
                    placeholder="Delivery address and GhanaPost GPS code"
                    className="min-h-28 w-full resize-none rounded-3xl border border-black/10 bg-white/90 px-12 py-4 outline-none"
                  />
                </div>
              )}

              <div className="rounded-3xl border border-black/10 bg-white/90 p-4">
                <label htmlFor="promotion-code" className="text-sm font-semibold">
                  Promotion code
                </label>
                <div className="mt-2 flex gap-2">
                  <input
                    id="promotion-code"
                    value={promotionInput}
                    onChange={(event) => setPromotionInput(event.target.value.toUpperCase())}
                    placeholder="Enter code"
                    className="h-12 min-w-0 flex-1 rounded-full border border-black/10 bg-white px-4 text-sm uppercase outline-none"
                  />
                  <button
                    type="button"
                    disabled={!promotionInput.trim() || quoteLoading}
                    onClick={() => {
                      setAppliedPromotionCode(promotionInput.trim());
                      setQuoteRevision((revision) => revision + 1);
                    }}
                    className="rounded-full bg-black px-5 text-sm font-semibold text-white disabled:opacity-40"
                  >
                    Apply
                  </button>
                </div>
                {quote?.promotionMessage && (
                  <p
                    role="status"
                    className={`mt-2 text-sm ${quote.promotionCodeValid ? "text-emerald-700" : "text-red-600"}`}
                  >
                    {quote.promotionMessage}
                  </p>
                )}
                {appliedPromotionCode && (
                  <button
                    type="button"
                    onClick={() => {
                      setPromotionInput("");
                      setAppliedPromotionCode("");
                    }}
                    className="mt-2 text-xs font-semibold text-black/55 underline underline-offset-4"
                  >
                    Remove code
                  </button>
                )}
              </div>

              <div className="rounded-3xl bg-white/90 p-5">
                <div className="mb-3 flex items-center gap-2">
                  <CreditCard size={18} />
                  <p className="text-sm font-semibold">Payment Method</p>
                </div>

                <div className="rounded-2xl border border-black bg-black px-4 py-3 text-sm font-semibold text-white">
                  Paystack Online Payment
                </div>

                <div className="mt-5 space-y-2 border-t border-black/10 pt-4 text-sm">
                  <div className="flex justify-between gap-4">
                    <span className="text-black/55">Subtotal</span>
                    <span>GH₵{(quote?.subtotal ?? subtotal).toLocaleString()}</span>
                  </div>
                  {(quote?.discount ?? 0) > 0 && (
                    <div className="flex justify-between gap-4 text-emerald-700">
                      <span>Promotion</span>
                      <span>−GH₵{quote?.discount.toLocaleString()}</span>
                    </div>
                  )}
                  <div className="flex justify-between gap-4">
                    <span className="text-black/55">
                      {fulfilmentType === "pickup" ? "Collection" : "Delivery"}
                    </span>
                    <span>
                      {quoteLoading
                        ? "Calculating…"
                        : (quote?.deliveryFee ?? 0) === 0
                          ? "Free"
                          : `GH₵${quote?.deliveryFee.toLocaleString()}`}
                    </span>
                  </div>
                  <div className="flex justify-between gap-4 pt-2 text-lg font-bold">
                    <span>Total</span>
                    <span>GH₵{(quote?.total ?? subtotal).toLocaleString()}</span>
                  </div>
                </div>

                {quote?.split && fulfilmentType === "delivery" && (
                  <p className="mt-4 rounded-2xl bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900">
                    Your cart will arrive in {quote.shipmentCount} shipments from different branches. The delivery total already includes each shipment.
                  </p>
                )}
                {fulfilmentType === "pickup" && (
                  <p className="mt-4 text-xs leading-5 text-black/50">
                    Collection is only confirmed when this branch can reserve the complete cart.
                  </p>
                )}
              </div>

              <button
                onClick={createOnlineOrder}
                disabled={placingOrder || quoteLoading || !quote}
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
