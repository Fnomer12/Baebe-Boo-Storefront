"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import { cartLineOptionSummary } from "@/domain/catalog/cart-line-options";
import {
  buildAutoSaveAddressPayload,
  composeAddressText,
  normalizeGhanaPhone,
  type SavedAddressSummary,
} from "@/lib/checkout/account-prefill";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  CreditCard,
  Home,
  Mail,
  MapPin,
  Phone,
  ShieldCheck,
  ShoppingBag,
  Store,
  Tag,
  Ticket,
  Truck,
  User,
} from "lucide-react";

type Shop = {
  id: string;
  name: string;
  location: string;
};

type DeliveryZone = {
  id: string;
  name: string;
  regions?: string[];
  baseFee: number;
  freeDeliveryThreshold: number | null;
  estimatedDaysMin: number | null;
  estimatedDaysMax: number | null;
};

type CheckoutQuote = {
  subtotal: number;
  discount: number;
  voucherCredit: number;
  deliveryFee: number;
  total: number;
  promotionMessage: string | null;
  promotionApplied: boolean;
  promotionCodeValid: boolean;
  voucherCode: string | null;
  voucherCodeValid: boolean;
  voucherMessage: string | null;
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
};

const cleanPrice = (price: number | string) => {
  if (typeof price === "number") return price;
  return Number(price.replace(/[^\d.]/g, "")) || 0;
};

const cartItemKey = (item: CartItem) =>
  [
    item.id,
    item.variantId || item.color || "default",
    item.size || "",
    item.shopId || item.shop?.id || "national",
  ].join(":");

const formatMoney = (value: number) => `GH₵${value.toLocaleString()}`;

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function CheckoutPage() {
  const router = useRouter();
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [cartLoaded, setCartLoaded] = useState(false);
  /**
   * Whether a customer session exists and how many addresses it already has,
   * captured once on mount. Only the post-payment auto-save reads it, so a
   * ref avoids re-rendering the whole form for data the UI never shows.
   */
  const accountRef = useRef<{ signedIn: boolean; savedAddressCount: number }>({
    signedIn: false,
    savedAddressCount: 0,
  });
  const [message, setMessage] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("+233");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [digitalAddress, setDigitalAddress] = useState("");
  const [deliveryInstructions, setDeliveryInstructions] = useState("");
  const [placingOrder, setPlacingOrder] = useState(false);
  const [fulfilmentType, setFulfilmentType] = useState<"delivery" | "pickup">("delivery");
  const [deliveryZones, setDeliveryZones] = useState<DeliveryZone[]>([]);
  const [shops, setShops] = useState<Shop[]>([]);
  const [deliveryZoneId, setDeliveryZoneId] = useState("");
  const [pickupShopId, setPickupShopId] = useState("");
  const [checkoutOptionsLoading, setCheckoutOptionsLoading] = useState(false);
  const [checkoutOptionsError, setCheckoutOptionsError] = useState("");
  const [promotionInput, setPromotionInput] = useState("");
  const [appliedPromotionCode, setAppliedPromotionCode] = useState("");
  const [voucherInput, setVoucherInput] = useState("");
  const [appliedVoucherCode, setAppliedVoucherCode] = useState("");
  const [quoteRevision, setQuoteRevision] = useState(0);
  const [quote, setQuote] = useState<CheckoutQuote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);

  const showMessage = useCallback((text: string) => {
    setMessage(text);
    setTimeout(() => setMessage(""), 3500);
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      try {
        const cart: unknown = JSON.parse(localStorage.getItem("baebe_cart") || "[]");
        setCartItems(Array.isArray(cart) ? cart : []);
      } catch {
        setCartItems([]);
      } finally {
        setCartLoaded(true);
      }
    });
  }, []);

  // Prefill from the signed-in customer's account. Functional updates fill
  // only fields that are still empty, so a fast typist is never clobbered by
  // the fetch landing late. Guests 401 on the profile call and bail. Any
  // failure is swallowed — prefill must never break checkout for anyone.
  useEffect(() => {
    const controller = new AbortController();
    const prefill = async () => {
      try {
        const [profileRes, addressesRes] = await Promise.all([
          fetch("/api/account/profile", { signal: controller.signal }),
          fetch("/api/account/addresses", { signal: controller.signal }),
        ]);
        if (!profileRes.ok) return;
        const profilePayload = (await profileRes.json().catch(() => null)) as {
          profile?: { full_name?: string | null; email?: string | null; phone?: string | null } | null;
        } | null;
        const profile = profilePayload?.profile;
        if (!profile) return;

        const addressesPayload = addressesRes.ok
          ? ((await addressesRes.json().catch(() => null)) as {
              addresses?: SavedAddressSummary[];
            } | null)
          : null;
        const addresses = addressesPayload?.addresses ?? [];
        accountRef.current = { signedIn: true, savedAddressCount: addresses.length };

        setCustomerName((value) => value || (profile.full_name ?? "").trim());
        setCustomerEmail((value) => value || (profile.email ?? "").trim());
        setCustomerPhone((value) => {
          if (value && value !== "+233") return value;
          return normalizeGhanaPhone(profile.phone) ?? value;
        });

        const defaultAddress = addresses[0];
        if (defaultAddress) {
          setDeliveryAddress((value) => value || composeAddressText(defaultAddress));
          setDigitalAddress((value) => value || (defaultAddress.digitalAddress ?? ""));
          setDeliveryInstructions(
            (value) => value || (defaultAddress.deliveryInstructions ?? ""),
          );
        }
      } catch {
        // Signed-out, offline, or aborted — checkout continues blank.
      }
    };
    void prefill();
    return () => controller.abort();
  }, []);

  const selectedShop = cartItems[0]?.shop || null;
  const selectedZone = deliveryZones.find((zone) => zone.id === deliveryZoneId) || null;
  const selectedPickupShop = shops.find((shop) => shop.id === pickupShopId) || null;
  const subtotal = useMemo(
    () => cartItems.reduce((total, item) => total + cleanPrice(item.price) * Number(item.quantity || 1), 0),
    [cartItems],
  );
  const cartCount = useMemo(
    () => cartItems.reduce((sum, item) => sum + Number(item.quantity || 1), 0),
    [cartItems],
  );
  const lineItems = useMemo(
    () =>
      cartItems.map((item) => ({
        productId: item.id,
        variantId: item.variantId,
        quantity: Number(item.quantity || 1),
      })),
    [cartItems],
  );
  const canRequestQuote =
    cartLoaded &&
    cartItems.length > 0 &&
    !checkoutOptionsLoading &&
    !checkoutOptionsError &&
    (fulfilmentType === "delivery" ? Boolean(deliveryZoneId) : Boolean(pickupShopId));
  const activeQuote = canRequestQuote ? quote : null;
  const deliveryAddressForApi = useMemo(
    () =>
      [
        deliveryAddress.trim(),
        digitalAddress.trim() ? `GhanaPost GPS: ${digitalAddress.trim()}` : "",
        deliveryInstructions.trim() ? `Delivery instructions: ${deliveryInstructions.trim()}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    [deliveryAddress, digitalAddress, deliveryInstructions],
  );

  const updateCart = useCallback((items: CartItem[]) => {
    setCartItems(items);
    localStorage.setItem("baebe_cart", JSON.stringify(items));
    if (items.length === 0) localStorage.removeItem("baebe_selected_shop");
    window.dispatchEvent(new Event("baebe_cart_updated"));
  }, []);

  useEffect(() => {
    if (!cartLoaded || cartItems.length === 0) return;

    const controller = new AbortController();
    const loadOptions = async () => {
      setCheckoutOptionsLoading(true);
      setCheckoutOptionsError("");
      try {
        const response = await fetch("/api/checkout/options", { signal: controller.signal });
        const result = await response.json();
        if (!response.ok || !result.status) {
          throw new Error(result.message || "Checkout options are unavailable.");
        }

        const nextZones = (result.deliveryZones || []) as DeliveryZone[];
        const nextShops = (result.shops || []) as Shop[];
        setDeliveryZones(nextZones);
        setShops(nextShops);
        setDeliveryZoneId((current) => current || nextZones[0]?.id || "");
        setPickupShopId((current) => current || selectedShop?.id || nextShops[0]?.id || "");
      } catch (error: unknown) {
        if (!controller.signal.aborted) {
          setCheckoutOptionsError(
            error instanceof Error ? error.message : "Checkout options are temporarily unavailable.",
          );
        }
      } finally {
        if (!controller.signal.aborted) setCheckoutOptionsLoading(false);
      }
    };

    void loadOptions();
    return () => controller.abort();
  }, [cartItems.length, cartLoaded, selectedShop?.id]);

  useEffect(() => {
    if (!canRequestQuote) return;

    const controller = new AbortController();
    const loadQuote = async () => {
      setQuoteLoading(true);
      try {
        const response = await fetch("/api/checkout/quote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            items: lineItems,
            fulfilmentType,
            deliveryZoneId: fulfilmentType === "delivery" ? deliveryZoneId : undefined,
            shopId: fulfilmentType === "pickup" ? pickupShopId : undefined,
            preferredShopId: fulfilmentType === "delivery" ? selectedShop?.id : undefined,
            promotionCode: appliedPromotionCode || undefined,
            voucherCode: appliedVoucherCode || undefined,
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
    appliedVoucherCode,
    canRequestQuote,
    deliveryZoneId,
    fulfilmentType,
    lineItems,
    pickupShopId,
    quoteRevision,
    selectedShop?.id,
    showMessage,
  ]);

  const handlePhoneChange = (value: string) => {
    const digitsOnly = value.replace(/[^\d]/g, "");
    let nationalNumber = digitsOnly;

    if (nationalNumber.startsWith("233")) nationalNumber = nationalNumber.slice(3);
    if (nationalNumber.startsWith("0")) nationalNumber = nationalNumber.slice(1);

    setCustomerPhone(`+233${nationalNumber.slice(0, 9)}`);
  };

  const validateCheckout = () => {
    if (!customerName.trim()) {
      showMessage("Enter customer name.");
      return false;
    }
    if (!customerEmail.trim() || !emailPattern.test(customerEmail.trim())) {
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
    if (!activeQuote) {
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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: customerEmail.trim(),
          name: customerName.trim(),
          phone: customerPhone.trim(),
          deliveryAddress: fulfilmentType === "delivery" ? deliveryAddressForApi : "Click-and-collect",
          fulfilmentType,
          deliveryZoneId: fulfilmentType === "delivery" ? deliveryZoneId : undefined,
          shopId: fulfilmentType === "pickup" ? pickupShopId : undefined,
          preferredShopId: fulfilmentType === "delivery" ? selectedShop?.id : undefined,
          promotionCode: appliedPromotionCode || undefined,
          voucherCode: appliedVoucherCode || undefined,
          items: cartSnapshot.map((item) => ({
            productId: item.id,
            variantId: item.variantId,
            quantity: Number(item.quantity || 1),
          })),
        }),
      });

      const initData = await initRes.json();
      if (!initRes.ok || !initData.status) {
        showMessage(initData.message || "Could not start Paystack payment.");
        setPlacingOrder(false);
        return;
      }

      // A signed-in customer's first delivery address is copied into their
      // saved addresses once payment lands. Fire-and-forget: the form state is
      // still in memory here, client-side navigation does not cancel the
      // fetch, and no failure of this call may touch the success flow.
      const autoSaveDeliveryAddress = () => {
        try {
          const account = accountRef.current;
          if (!account.signedIn || account.savedAddressCount > 0) return;
          if (fulfilmentType !== "delivery") return;
          const payload = buildAutoSaveAddressPayload({
            customerName,
            customerPhone,
            deliveryAddress,
            digitalAddress,
            deliveryInstructions,
            zoneName: selectedZone?.name,
            zoneRegions: selectedZone?.regions,
          });
          if (!payload) return;
          void fetch("/api/account/addresses", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            keepalive: true,
            body: JSON.stringify(payload),
          }).catch(() => {});
        } catch {
          // Never let a convenience copy interfere with a paid order.
        }
      };

      const goToSuccess = (pendingFinalisation: boolean) => {
        autoSaveDeliveryAddress();
        updateCart([]);
        // No form resets and `placingOrder` stays true: the component unmounts
        // on navigation, and a disabled Pay button prevents a double charge
        // during the transition.
        const orderQuery = encodeURIComponent(initData.data.order_number || "");
        router.push(
          `/checkout/success?order=${orderQuery}${pendingFinalisation ? "&pending=1" : ""}`,
        );
      };

      const verifyPayment = async (reference: string) => {
        const verifyRes = await fetch("/api/paystack/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reference, orderId: initData.data.order_id }),
        });
        if (verifyRes.status >= 500) throw new Error("verify unavailable");
        const verifyData = await verifyRes.json();
        return { ok: verifyRes.ok, data: verifyData as { status?: boolean; message?: string } };
      };

      // Shared by both paths so a simulated order is confirmed through exactly
      // the same verification and cleanup as a real one.
      const finishOrder = async (candidateReference?: string) => {
        const reference = candidateReference || initData.data.reference;
        if (!reference) {
          showMessage("Payment reference not found.");
          setPlacingOrder(false);
          return;
        }

        try {
          const verified = await verifyPayment(reference);
          if (!verified.ok || !verified.data.status) {
            // Paystack itself rejected the charge — safe to let them retry.
            showMessage(verified.data.message || "Payment could not be verified.");
            setPlacingOrder(false);
            return;
          }
          goToSuccess(false);
        } catch {
          // The popup reported a successful charge but our verify call could
          // not complete. The customer HAS paid and the Paystack webhook will
          // finalize the order server-side — retry once, and if the server
          // still cannot be reached, land them on the pending success page
          // rather than an error that invites a second payment.
          try {
            const retried = await verifyPayment(reference);
            if (retried.ok && retried.data.status) {
              goToSuccess(false);
            } else {
              // A definitive answer this time: the server looked and said no.
              showMessage(retried.data.message || "Payment could not be verified.");
              setPlacingOrder(false);
            }
          } catch {
            goToSuccess(true);
          }
        }
      };

      if (!initData.data?.access_code) {
        showMessage(initData.message || "Could not start Paystack payment.");
        setPlacingOrder(false);
        return;
      }

      const PaystackPop = (await import("@paystack/inline-js")).default;
      const popup = new PaystackPop();

      popup.resumeTransaction(initData.data.access_code, {
        onSuccess: (transaction: { reference?: string }) => {
          void finishOrder(transaction?.reference);
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

  const payDisabled = placingOrder || quoteLoading || !activeQuote || Boolean(checkoutOptionsError);

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
          <Link
            href="/cart"
            className="mb-6 inline-flex items-center gap-2 rounded-full border border-black/10 bg-white px-4 py-2 text-sm font-semibold text-black/70 shadow-sm transition hover:border-black/25 hover:text-black"
          >
            <ArrowLeft size={16} />
            Back to cart
          </Link>

          <div className="mb-8 grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-end">
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-[0.18em] text-black/40 sm:text-sm sm:tracking-[0.2em]">
                Secure Checkout
              </p>
              <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl md:text-6xl">
                Delivery & Payment
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-black/60 sm:text-base">
                Choose delivery or click-and-collect, confirm your details, then pay online through Paystack.
              </p>
            </div>
            <div className="rounded-[1.5rem] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-950">
              <p className="flex items-center gap-2 font-semibold">
                <ShieldCheck size={18} />
                Secure payment
              </p>
              <p className="mt-1 text-emerald-900/75">
                Stock is reserved only after checkout pricing confirms the selected delivery system.
              </p>
            </div>
          </div>

          {!cartLoaded ? (
            <div className="rounded-[2rem] bg-white p-8 text-center shadow-sm">
              <p className="text-sm font-semibold text-black/55">Loading checkout...</p>
            </div>
          ) : cartItems.length === 0 ? (
            <div className="rounded-[1.75rem] bg-white p-8 text-center shadow-sm sm:p-12 md:rounded-[2.5rem]">
              <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-[#DDF2FF]">
                <ShoppingBag size={30} />
              </div>
              <h2 className="text-2xl font-semibold">Your cart is empty</h2>
              <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-black/55">
                Add items to your cart before starting checkout.
              </p>
              <Link
                href="/store"
                className="shimmer-btn mt-6 inline-flex rounded-full bg-black px-8 py-4 text-sm font-semibold text-white shadow-lg transition hover:scale-[1.02] hover:bg-neutral-900"
              >
                <span className="relative z-10 text-white">Continue Shopping</span>
              </Link>
            </div>
          ) : (
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_430px]">
              <div className="space-y-5">
                {checkoutOptionsError && (
                  <div role="alert" className="rounded-[1.5rem] border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
                    <p className="flex items-center gap-2 font-semibold">
                      <AlertTriangle size={18} />
                      Checkout is temporarily unavailable
                    </p>
                    <p className="mt-1">
                      {checkoutOptionsError} Please try again shortly or contact Baebe Boo to complete your order manually.
                    </p>
                  </div>
                )}

                <section className="rounded-[2rem] bg-white p-5 shadow-sm sm:p-6">
                  <div className="mb-5 flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-black/40">Step 1</p>
                      <h2 className="mt-1 text-2xl font-semibold">Delivery System</h2>
                    </div>
                    <Truck className="text-black/35" size={24} />
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => setFulfilmentType("delivery")}
                      className={`min-h-28 rounded-[1.5rem] border p-4 text-left transition ${
                        fulfilmentType === "delivery"
                          ? "border-black bg-black text-white"
                          : "border-black/10 bg-[#F8F5F0] text-black hover:border-black/25"
                      }`}
                    >
                      <Truck size={22} />
                      <span className="mt-3 block font-semibold">Delivery</span>
                      <span className={`mt-1 block text-sm leading-5 ${fulfilmentType === "delivery" ? "text-white/65" : "text-black/50"}`}>
                        Nationwide delivery to your address.
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setFulfilmentType("pickup")}
                      className={`min-h-28 rounded-[1.5rem] border p-4 text-left transition ${
                        fulfilmentType === "pickup"
                          ? "border-black bg-black text-white"
                          : "border-black/10 bg-[#F8F5F0] text-black hover:border-black/25"
                      }`}
                    >
                      <Store size={22} />
                      <span className="mt-3 block font-semibold">Click & collect</span>
                      <span className={`mt-1 block text-sm leading-5 ${fulfilmentType === "pickup" ? "text-white/65" : "text-black/50"}`}>
                        Collect at a branch with no delivery fee.
                      </span>
                    </button>
                  </div>

                  <div className="mt-5">
                    <label className="text-xs font-semibold uppercase tracking-[0.16em] text-black/45" htmlFor="fulfilment-location">
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
                      disabled={checkoutOptionsLoading || Boolean(checkoutOptionsError)}
                      className="mt-2 h-13 w-full rounded-full border border-black/10 bg-white px-4 text-sm outline-none disabled:opacity-50"
                    >
                      <option value="">
                        {checkoutOptionsLoading ? "Loading options..." : checkoutOptionsError ? "Options unavailable" : "Choose an option"}
                      </option>
                      {fulfilmentType === "delivery"
                        ? deliveryZones.map((zone) => (
                            <option key={zone.id} value={zone.id}>
                              {zone.name} - {formatMoney(zone.baseFee)}
                            </option>
                          ))
                        : shops.map((shop) => (
                            <option key={shop.id} value={shop.id}>
                              {shop.name} - {shop.location}
                            </option>
                          ))}
                    </select>
                  </div>

                  {fulfilmentType === "delivery" && selectedZone && (
                    <div className="mt-4 grid gap-3 sm:grid-cols-3">
                      <InfoPill label="Base fee" value={formatMoney(selectedZone.baseFee)} />
                      <InfoPill
                        label="ETA"
                        value={
                          selectedZone.estimatedDaysMin === null
                            ? "Confirmed after payment"
                            : `${selectedZone.estimatedDaysMin}-${selectedZone.estimatedDaysMax ?? selectedZone.estimatedDaysMin} days`
                        }
                      />
                      <InfoPill
                        label="Free delivery"
                        value={
                          selectedZone.freeDeliveryThreshold === null
                            ? "Not available"
                            : `From ${formatMoney(selectedZone.freeDeliveryThreshold)}`
                        }
                      />
                    </div>
                  )}

                  {fulfilmentType === "pickup" && selectedPickupShop && (
                    <div className="mt-4 rounded-[1.25rem] bg-[#DDF2FF] p-4 text-sm leading-6 text-black/65">
                      <p className="flex items-center gap-2 font-semibold text-black">
                        <MapPin size={16} />
                        {selectedPickupShop.name}
                      </p>
                      <p className="mt-1">{selectedPickupShop.location}</p>
                    </div>
                  )}
                </section>

                <section className="rounded-[2rem] bg-white p-5 shadow-sm sm:p-6">
                  <div className="mb-5 flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-black/40">Step 2</p>
                      <h2 className="mt-1 text-2xl font-semibold">Customer Details</h2>
                    </div>
                    <User className="text-black/35" size={24} />
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <InputIcon icon={<User size={18} />}>
                      <input
                        value={customerName}
                        onChange={(event) => setCustomerName(event.target.value)}
                        placeholder="Customer name"
                        className="h-14 w-full rounded-full border border-black/10 bg-white/90 pl-12 pr-5 outline-none"
                      />
                    </InputIcon>
                    <InputIcon icon={<Phone size={18} />}>
                      <input
                        value={customerPhone}
                        onChange={(event) => handlePhoneChange(event.target.value)}
                        placeholder="+233 phone number"
                        className="h-14 w-full rounded-full border border-black/10 bg-white/90 pl-12 pr-5 outline-none"
                      />
                    </InputIcon>
                    <div className="sm:col-span-2">
                      <InputIcon icon={<Mail size={18} />}>
                        <input
                          value={customerEmail}
                          onChange={(event) => setCustomerEmail(event.target.value)}
                          placeholder="Customer email"
                          type="email"
                          className="h-14 w-full rounded-full border border-black/10 bg-white/90 pl-12 pr-5 outline-none"
                        />
                      </InputIcon>
                    </div>
                  </div>
                </section>

                {fulfilmentType === "delivery" && (
                  <section className="rounded-[2rem] bg-white p-5 shadow-sm sm:p-6">
                    <div className="mb-5 flex items-start justify-between gap-4">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-black/40">Step 3</p>
                        <h2 className="mt-1 text-2xl font-semibold">Delivery Address</h2>
                      </div>
                      <Home className="text-black/35" size={24} />
                    </div>

                    <div className="space-y-4">
                      <div className="relative">
                        <Home size={18} className="absolute left-5 top-5 text-black/40" />
                        <textarea
                          value={deliveryAddress}
                          onChange={(event) => setDeliveryAddress(event.target.value)}
                          placeholder="Street address, area, landmark"
                          className="min-h-28 w-full resize-none rounded-[1.5rem] border border-black/10 bg-white/90 px-12 py-4 outline-none"
                        />
                      </div>
                      <input
                        value={digitalAddress}
                        onChange={(event) => setDigitalAddress(event.target.value.toUpperCase())}
                        placeholder="GhanaPost GPS code (optional)"
                        className="h-14 w-full rounded-full border border-black/10 bg-white/90 px-5 uppercase outline-none"
                      />
                      <textarea
                        value={deliveryInstructions}
                        onChange={(event) => setDeliveryInstructions(event.target.value)}
                        placeholder="Delivery instructions (optional)"
                        className="min-h-24 w-full resize-none rounded-[1.5rem] border border-black/10 bg-white/90 px-5 py-4 outline-none"
                      />
                    </div>
                  </section>
                )}
              </div>

              <aside className="h-fit rounded-[2rem] bg-white p-5 shadow-sm sm:p-6 lg:sticky lg:top-28">
                <div className="mb-5 flex items-center justify-between gap-4">
                  <h2 className="text-2xl font-semibold">Order Summary</h2>
                  <CreditCard className="text-black/35" size={23} />
                </div>

                <div className="max-h-72 space-y-3 overflow-y-auto pr-1">
                  {cartItems.map((item) => {
                    const quantity = Number(item.quantity || 1);
                    const price = cleanPrice(item.price);
                    return (
                      <div key={cartItemKey(item)} className="grid grid-cols-[64px_1fr] gap-3 rounded-[1.25rem] bg-[#F8F5F0] p-3">
                        <div className="aspect-square overflow-hidden rounded-2xl bg-white">
                          {item.imageUrl ? (
                            <Image
                              src={item.imageUrl}
                              alt={item.name}
                              width={128}
                              height={128}
                              unoptimized
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center">
                              <ShoppingBag size={20} className="text-black/35" />
                            </div>
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">{item.name}</p>
                          <p className="mt-1 text-xs text-black/45">
                            Qty {quantity}
                            {cartLineOptionSummary(item) ? ` - ${cartLineOptionSummary(item)}` : ""}
                          </p>
                          <p className="mt-2 text-sm font-bold">{formatMoney(price * quantity)}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-5 rounded-[1.5rem] border border-black/10 p-4">
                  <label htmlFor="promotion-code" className="flex items-center gap-2 text-sm font-semibold">
                    <Tag size={16} />
                    Promotion code
                  </label>
                  <div className="mt-3 flex gap-2">
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
                  {activeQuote?.promotionMessage && (
                    <p
                      role="status"
                      className={`mt-2 text-sm ${activeQuote.promotionCodeValid ? "text-emerald-700" : "text-red-600"}`}
                    >
                      {activeQuote.promotionMessage}
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

                <div className="mt-5 rounded-[1.5rem] border border-black/10 p-4">
                  <label htmlFor="voucher-code" className="flex items-center gap-2 text-sm font-semibold">
                    <Ticket size={16} />
                    Gift voucher
                  </label>
                  <div className="mt-3 flex gap-2">
                    <input
                      id="voucher-code"
                      value={voucherInput}
                      onChange={(event) => setVoucherInput(event.target.value.toUpperCase())}
                      placeholder="Enter voucher code"
                      className="h-12 min-w-0 flex-1 rounded-full border border-black/10 bg-white px-4 text-sm uppercase outline-none"
                    />
                    <button
                      type="button"
                      disabled={!voucherInput.trim() || quoteLoading}
                      onClick={() => {
                        setAppliedVoucherCode(voucherInput.trim());
                        setQuoteRevision((revision) => revision + 1);
                      }}
                      className="rounded-full bg-black px-5 text-sm font-semibold text-white disabled:opacity-40"
                    >
                      Apply
                    </button>
                  </div>
                  {activeQuote?.voucherMessage && (
                    <p
                      role="status"
                      className={`mt-2 text-sm ${activeQuote.voucherCodeValid ? "text-emerald-700" : "text-red-600"}`}
                    >
                      {activeQuote.voucherMessage}
                    </p>
                  )}
                  {appliedVoucherCode && (
                    <button
                      type="button"
                      onClick={() => {
                        setVoucherInput("");
                        setAppliedVoucherCode("");
                      }}
                      className="mt-2 text-xs font-semibold text-black/55 underline underline-offset-4"
                    >
                      Remove voucher
                    </button>
                  )}
                </div>

                <div className="mt-5 space-y-3 border-t border-black/10 pt-5 text-sm">
                  <SummaryRow label="Subtotal" value={formatMoney(activeQuote?.subtotal ?? subtotal)} />
                  {(activeQuote?.discount ?? 0) > 0 && (
                    <SummaryRow label="Promotion" value={`-${formatMoney(activeQuote?.discount ?? 0)}`} tone="success" />
                  )}
                  {(activeQuote?.voucherCredit ?? 0) > 0 && (
                    <SummaryRow label="Gift voucher" value={`-${formatMoney(activeQuote?.voucherCredit ?? 0)}`} tone="success" />
                  )}
                  {/*
                    Without a quote the fee is unknown, not zero. The previous
                    `(activeQuote?.deliveryFee ?? 0) === 0` collapsed "no quote
                    yet" into "Free" and showed the bare subtotal as the total,
                    so a failed quote quietly promised free delivery at a price
                    that excluded it.
                  */}
                  <SummaryRow
                    label={fulfilmentType === "pickup" ? "Collection" : "Delivery"}
                    value={
                      quoteLoading
                        ? "Calculating..."
                        : !activeQuote
                          ? "—"
                          : activeQuote.deliveryFee === 0
                            ? "Free"
                            : formatMoney(activeQuote.deliveryFee)
                    }
                  />
                  <div className="flex justify-between gap-4 border-t border-black/10 pt-4 text-xl font-bold">
                    <span>Total</span>
                    <span>
                      {quoteLoading
                        ? "Calculating..."
                        : activeQuote
                          ? formatMoney(activeQuote.total)
                          : "—"}
                    </span>
                  </div>
                </div>

                {activeQuote?.split && fulfilmentType === "delivery" && (
                  <p className="mt-4 rounded-[1.25rem] bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900">
                    Your cart will arrive in {activeQuote.shipmentCount} shipments from different branches. The delivery total already includes each shipment.
                  </p>
                )}

                {activeQuote && !activeQuote.split && (
                  <p className="mt-4 flex items-center gap-2 rounded-[1.25rem] bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-900">
                    <CheckCircle2 size={16} />
                    Secure total confirmed
                  </p>
                )}

                <button
                  onClick={createOnlineOrder}
                  disabled={payDisabled}
                  className="mt-5 h-14 w-full rounded-full bg-black text-sm font-semibold text-white shadow-lg transition hover:bg-neutral-900 disabled:opacity-50"
                >
                  {checkoutOptionsError
                    ? "Checkout unavailable"
                    : placingOrder
                      ? "Processing Payment..."
                      : quoteLoading
                        ? "Calculating total..."
                        : "Pay Online"}
                </button>
              </aside>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

function InfoPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[1.25rem] bg-[#F8F5F0] p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-black/35">{label}</p>
      <p className="mt-2 text-sm font-semibold text-black/70">{value}</p>
    </div>
  );
}

function SummaryRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "success";
}) {
  return (
    <div className={`flex justify-between gap-4 ${tone === "success" ? "text-emerald-700" : ""}`}>
      <span className={tone === "success" ? "" : "text-black/55"}>{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}

function InputIcon({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="relative">
      <div className="absolute left-5 top-1/2 -translate-y-1/2 text-black/40">{icon}</div>
      {children}
    </div>
  );
}
