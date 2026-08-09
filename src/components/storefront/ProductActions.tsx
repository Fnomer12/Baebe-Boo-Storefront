"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Check, GitCompareArrows, Heart, ShoppingBag } from "lucide-react";
import WhatsAppIcon from "@/components/WhatsAppIcon";
import { optionKey, type OptionSelection } from "@/domain/catalog/product-options";
import { applyOptionChoice } from "@/domain/catalog/option-picker";
import { defaultSelection, findVariantForSelection, optionAvailability } from "@/domain/catalog/variant-selection";
import { formatPrice, productPriceRange, type StorefrontProduct } from "./catalog-data";
import { whatsappUrl } from "./StorefrontChrome";
import { addProductToCart, compareProductIds, productListContains, recordRecentlyViewed, selectedStore, storefrontKeys, toggleProductList } from "@/lib/storefront-state";

/** The one event the server-rendered page listens for. See ProductGallery. */
export const variantSelectedEvent = "baebe_variant_selected";

type Availability = "loading" | "in_stock" | "low_stock" | "out_of_stock" | "unknown";

const availabilityCopy: Record<Availability, { label: string; dot: string }> = {
  loading: { label: "Checking availability…", dot: "bg-black/25" },
  in_stock: { label: "In stock", dot: "bg-[#3f7d55]" },
  low_stock: { label: "Low stock — order soon", dot: "bg-[#c0803a]" },
  out_of_stock: { label: "Out of stock", dot: "bg-[#b4453c]" },
  unknown: { label: "Availability confirmed at checkout", dot: "bg-black/25" },
};

/**
 * A one-value option is not a choice, so it is never rendered as a picker —
 * the product detail table carries it instead.
 *
 * `disabled` marks the values no live version offers alongside the choices
 * already made. They are struck through rather than hidden, so a shopper can
 * see that the shop stocks Blue, just not in the size they picked.
 */
function OptionGroup({
  label,
  values,
  selected,
  disabled,
  onSelect,
}: {
  label: string;
  values: string[];
  selected: string;
  disabled?: Record<string, boolean>;
  onSelect: (value: string) => void;
}) {
  if (values.length < 2) return null;
  return (
    <fieldset>
      <legend className="mb-2.5 flex items-baseline gap-2 text-xs font-bold uppercase tracking-[0.14em] text-black/45">
        {label}
        <span className="text-sm font-semibold normal-case tracking-normal text-black">{selected}</span>
      </legend>
      <div className="flex flex-wrap gap-2">
        {values.map((value) => {
          const unavailable = Boolean(disabled?.[value]);
          return (
            <button
              key={value}
              type="button"
              disabled={unavailable}
              onClick={() => onSelect(value)}
              aria-pressed={selected === value}
              aria-label={unavailable ? `${value} — unavailable` : undefined}
              className={`min-h-11 min-w-14 rounded-xl border px-3.5 py-2 text-sm font-medium transition ${
                unavailable
                  ? "cursor-not-allowed border-black/10 bg-white text-black/30 line-through"
                  : selected === value
                    ? "border-black bg-black text-white"
                    : "border-black/12 bg-white hover:border-black/45"
              }`}
            >
              {value}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

export default function ProductActions({ product }: { product: StorefrontProduct }) {
  const hasLiveProductId = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(product.id);
  const options = product.options;
  const variants = useMemo(() => product.variants ?? [], [product.variants]);
  const [selection, setSelection] = useState<OptionSelection>(() => defaultSelection(options, variants));
  const [message, setMessage] = useState("");
  const [wished, setWished] = useState(false);
  const [comparing, setComparing] = useState(false);
  const [compareCount, setCompareCount] = useState(0);
  const [availability, setAvailability] = useState<Availability>(hasLiveProductId ? "loading" : "unknown");

  useEffect(() => {
    recordRecentlyViewed(product.id);
    const refreshWishlist = () => setWished(productListContains(storefrontKeys.wishlist, product.id));
    const frame = window.requestAnimationFrame(() => {
      refreshWishlist();
      setComparing(productListContains(storefrontKeys.compare, product.id));
      setCompareCount(compareProductIds().length);
    });
    window.addEventListener("baebe_wishlist_hydrated", refreshWishlist);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("baebe_wishlist_hydrated", refreshWishlist);
    };
  }, [product.id]);

  useEffect(() => {
    if (!hasLiveProductId) return;
    let active = true;
    void fetch(`/api/products/${encodeURIComponent(product.id)}/availability`)
      .then((response) => response.ok ? response.json() : null)
      .then((result: { availability?: string } | null) => {
        if (!active) return;
        const value = result?.availability;
        setAvailability(value === "in_stock" || value === "low_stock" || value === "out_of_stock" ? value : "unknown");
      })
      .catch(() => {
        if (active) setAvailability("unknown");
      });
    return () => { active = false; };
  }, [hasLiveProductId, product.id]);

  const selectedVariant = useMemo(
    () => findVariantForSelection(variants, selection, options),
    [options, selection, variants],
  );

  /**
   * Availability is only meaningful once there are versions to compare. A
   * product with no variant rows — every demo product, and any product whose
   * seller never split it — would otherwise grey out its own pickers.
   */
  const availabilityByOption = useMemo(
    () => (variants.length ? optionAvailability(options, variants, selection) : []),
    [options, selection, variants],
  );

  // One event, so the server-rendered gallery can follow the chosen version
  // without the whole product page becoming a client component.
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent(variantSelectedEvent, {
        detail: { productId: product.id, variantId: selectedVariant?.id, imageUrl: selectedVariant?.imageUrl },
      }),
    );
  }, [product.id, selectedVariant]);

  function chooseValue(optionName: string, value: string) {
    setSelection((current) => applyOptionChoice(options, variants, current, optionName, value));
  }

  function addToBag(buyNow = false) {
    if (availability === "out_of_stock") {
      setMessage("This item is currently out of stock.");
      return;
    }
    const shop = selectedStore();
    if (variants.length && !selectedVariant) {
      setMessage("That combination is not available. Try another one above.");
      return;
    }
    addProductToCart(product, {
      optionValues: selection,
      variantId: selectedVariant?.id,
      unitPrice: selectedVariant?.price,
      shop,
    });
    setMessage(shop ? `Added to your ${shop.name} bag.` : "Added to your bag. We’ll confirm the best fulfilment location at checkout.");
    if (buyNow) window.location.assign("/cart");
  }

  function toggleWishlist() {
    const result = toggleProductList(storefrontKeys.wishlist, product.id);
    setWished(result.active);
    setMessage(result.active ? "Saved to your wishlist." : "Removed from your wishlist.");
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(product.id)) {
      void fetch("/api/account/wishlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: product.id, active: result.active }),
      });
    }
  }

  function toggleCompare() {
    const result = toggleProductList(storefrontKeys.compare, product.id, 4);
    if (result.full) {
      setMessage("You can compare up to four products. Remove one before adding another.");
      return;
    }
    setComparing(result.active);
    setCompareCount(compareProductIds().length);
    setMessage(result.active ? "Added to compare." : "Removed from compare.");
  }
  const soldOut = availability === "out_of_stock";
  const status = availabilityCopy[availability];
  const { from, to } = productPriceRange(product);
  // The headline above shows the span. Repeating a single price under the
  // pickers would just be the same number twice.
  const showSelectionPrice = from !== to;
  const askUrl = whatsappUrl.startsWith("https://")
    ? `${whatsappUrl.split("?")[0]}?text=${encodeURIComponent(`Hello Baebe Boo, I have a question about ${product.name}.`)}`
    : whatsappUrl;

  return (
    <div className="space-y-5">
      {options.map((option) => {
        const key = optionKey(option.name);
        const entry = availabilityByOption.find((item) => item.key === key);
        const disabled = Object.fromEntries(
          (entry?.values || []).map((value) => [value.value, !value.available]),
        );
        return (
          <OptionGroup
            key={key}
            label={option.name}
            values={option.values}
            selected={selection[key] || ""}
            disabled={disabled}
            onSelect={(value) => chooseValue(option.name, value)}
          />
        );
      })}

      {showSelectionPrice && (
        <p aria-live="polite" className="text-2xl font-semibold">
          {formatPrice(selectedVariant?.price ?? product.price)}
        </p>
      )}

      <p className="flex items-center gap-2 text-sm text-black/55">
        <span aria-hidden className={`h-2 w-2 rounded-full ${status.dot}`} />
        {status.label}
      </p>

      <div className="flex gap-2">
        <button
          type="button"
          disabled={soldOut}
          onClick={() => addToBag(false)}
          className="storefront-primary-button flex-1 disabled:cursor-not-allowed disabled:opacity-45"
        >
          <ShoppingBag size={18} /> {soldOut ? "Out of stock" : "Add to bag"}
        </button>
        <button
          type="button"
          onClick={toggleWishlist}
          aria-pressed={wished}
          aria-label={wished ? "Remove from wishlist" : "Save to wishlist"}
          className="storefront-secondary-button aspect-square !px-0 !min-w-[3.25rem]"
        >
          {wished ? <Check size={18} /> : <Heart size={18} />}
        </button>
      </div>
      <button
        type="button"
        disabled={soldOut}
        onClick={() => addToBag(true)}
        className="storefront-secondary-button w-full disabled:cursor-not-allowed disabled:opacity-45"
      >
        Buy now
      </button>

      <p role="status" aria-live="polite" className="min-h-5 text-sm font-medium text-[#396347]">{message}</p>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-black/10 pt-4 text-sm font-semibold">
        <Link href={askUrl} target="_blank" className="flex items-center gap-2 text-black/65 hover:text-black">
          <WhatsAppIcon size={16} /> Ask about this product
        </Link>
        <button type="button" onClick={toggleCompare} aria-pressed={comparing} className="flex items-center gap-2 text-black/65 hover:text-black">
          {comparing ? <Check size={16} /> : <GitCompareArrows size={16} />} {comparing ? "Added to compare" : "Compare"}
        </button>
        {compareCount > 0 && (
          <Link href="/compare" className="text-[var(--color-brand-deep)] underline underline-offset-4">
            View compare ({compareCount})
          </Link>
        )}
      </div>
    </div>
  );
}
