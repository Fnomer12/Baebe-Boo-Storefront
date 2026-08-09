"use client";

import { useEffect, useMemo, useState } from "react";
import { Maximize2, Play, X } from "lucide-react";
import { ProductVisual } from "./ProductCard";
import { variantSelectedEvent } from "./ProductActions";
import type { StorefrontProduct } from "./catalog-data";

export default function ProductGallery({ product }: { product: StorefrontProduct }) {
  const media = useMemo(
    () =>
      product.media?.length
        ? product.media
        : product.imageUrl
          ? [{ type: "image" as const, url: product.imageUrl, alt: product.name }]
          : [],
    [product.imageUrl, product.media, product.name],
  );
  const [selected, setSelected] = useState(0);
  const [zoomed, setZoomed] = useState(false);
  const active = media[selected];

  /** Where the gallery goes back to: the product's own photo, not a version's. */
  const mainImageIndex = useMemo(() => {
    const declared = product.imageUrl ? media.findIndex((item) => item.url === product.imageUrl) : -1;
    if (declared >= 0) return declared;
    const firstImage = media.findIndex((item) => item.type === "image");
    return firstImage >= 0 ? firstImage : 0;
  }, [media, product.imageUrl]);

  /**
   * Whether any photo belongs to a single version. Only then does a version
   * change mean anything to this gallery — on a product where no photo is
   * tagged, snapping back on every chip click would undo the thumbnail the
   * shopper just chose.
   */
  const hasVariantPhotos = useMemo(() => media.some((item) => Boolean(item.variantId)), [media]);

  // Picking a version in the buy box swaps the photo. Listening for one event
  // keeps the product page a server component: the pickers live in a sibling
  // island, and neither has to own the other's state.
  useEffect(() => {
    function showVariantImage(event: Event) {
      const detail = (event as CustomEvent<{ productId?: string; imageUrl?: string }>).detail;
      if (!detail || detail.productId !== product.id) return;
      if (!detail.imageUrl) {
        // The chosen version has no photo of its own. Leaving the previous
        // version's photo up makes the picture contradict the pickers — a
        // shopper who picks Blue must not be looking at the pink one.
        if (hasVariantPhotos) setSelected(mainImageIndex);
        return;
      }
      const index = media.findIndex((item) => item.url === detail.imageUrl);
      if (index >= 0) setSelected(index);
    }
    window.addEventListener(variantSelectedEvent, showVariantImage);
    return () => window.removeEventListener(variantSelectedEvent, showVariantImage);
  }, [hasVariantPhotos, mainImageIndex, media, product.id]);

  const visual = active ? (
    active.type === "video" ? (
      <video controls playsInline preload="metadata" className="h-full w-full object-contain" aria-label={active.alt}>
        <source src={active.url} />
      </video>
    ) : active.type === "model_3d" ? (
      <div className="flex h-full flex-col items-center justify-center gap-4 bg-[#f5eee5] p-8 text-center">
        <Maximize2 size={32} />
        <p className="font-semibold">Interactive 360° / 3D product view</p>
        <a href={active.url} target="_blank" rel="noreferrer" className="storefront-secondary-button">Open interactive view</a>
      </div>
    ) : (
      // Catalog media is administrator-controlled and constrained by CSP.
      // eslint-disable-next-line @next/next/no-img-element
      <img src={active.url} alt={active.alt} className="h-full w-full object-contain" />
    )
  ) : (
    <ProductVisual product={product} className="h-full" />
  );

  return (
    <>
      <div className={`storefront-product-gallery grid gap-3 ${media.length > 1 ? "sm:grid-cols-[1fr_90px]" : ""}`}>
        {/* Catalog photography is shot on a light grey sweep, so the frame matches it —
            otherwise object-contain letterboxing reads as a grey box inside a white box. */}
        <div className="storefront-product-gallery-main relative aspect-square overflow-hidden rounded-[2.5rem] bg-[#f0f0f0]">
          {visual}
          {active?.type === "image" && <button type="button" onClick={() => setZoomed(true)} aria-label="Zoom product image" className="absolute bottom-4 right-4 grid h-11 w-11 place-items-center rounded-full bg-white/90 shadow"><Maximize2 size={18} /></button>}
        </div>
        {media.length > 1 && (
        <div className="storefront-product-thumbs order-first flex gap-2 overflow-x-auto sm:order-none sm:flex-col">
          {media.map((item, index) => (
            <button key={`${item.url}-${index}`} type="button" onClick={() => setSelected(index)} aria-label={item.alt || `View ${item.type} ${index + 1}`} aria-pressed={selected === index} className="relative aspect-square w-16 shrink-0 overflow-hidden rounded-2xl border bg-[#f0f0f0] p-1 aria-pressed:border-black sm:w-full">
              {item.type === "image" && item.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.url} alt="" className="h-full w-full rounded-xl object-cover" />
              ) : item.type === "video" ? <Play className="m-auto h-full" size={22} /> : <Maximize2 className="m-auto h-full" size={22} />}
            </button>
          ))}
        </div>
        )}
      </div>

      {zoomed && active?.type === "image" && (
        <div role="dialog" aria-modal="true" aria-label={`Zoomed view of ${product.name}`} className="fixed inset-0 z-[120] grid place-items-center bg-black/85 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setZoomed(false); }}>
          <button type="button" onClick={() => setZoomed(false)} aria-label="Close zoom" className="absolute right-5 top-5 grid h-12 w-12 place-items-center rounded-full bg-white text-black"><X size={20} /></button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={active.url} alt={active.alt} className="max-h-[90dvh] max-w-[95vw] object-contain" />
        </div>
      )}
    </>
  );
}
