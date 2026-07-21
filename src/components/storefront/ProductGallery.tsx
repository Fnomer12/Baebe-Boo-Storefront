"use client";

import { useState } from "react";
import { Maximize2, Play, X } from "lucide-react";
import { ProductVisual } from "./ProductCard";
import type { StorefrontProduct } from "./catalog-data";

export default function ProductGallery({ product }: { product: StorefrontProduct }) {
  const media = product.media?.length
    ? product.media
    : product.imageUrl
      ? [{ type: "image" as const, url: product.imageUrl, alt: product.name }]
      : [];
  const [selected, setSelected] = useState(0);
  const [zoomed, setZoomed] = useState(false);
  const active = media[selected];

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
      <div className="grid gap-3 sm:grid-cols-[1fr_90px]">
        <div className="relative aspect-square overflow-hidden rounded-[2.5rem] bg-white">
          {visual}
          {active?.type === "image" && <button type="button" onClick={() => setZoomed(true)} aria-label="Zoom product image" className="absolute bottom-4 right-4 grid h-11 w-11 place-items-center rounded-full bg-white/90 shadow"><Maximize2 size={18} /></button>}
        </div>
        <div className="order-first flex gap-2 overflow-x-auto sm:order-none sm:flex-col">
          {(media.length ? media : [{ type: "image" as const, url: "", alt: product.name }]).map((item, index) => (
            <button key={`${item.url}-${index}`} type="button" onClick={() => setSelected(index)} aria-label={`View ${item.type} ${index + 1}`} aria-pressed={selected === index} className="relative aspect-square w-16 shrink-0 overflow-hidden rounded-2xl border bg-white p-1 aria-pressed:border-black sm:w-full">
              {item.type === "image" && item.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.url} alt="" className="h-full w-full rounded-xl object-cover" />
              ) : item.type === "video" ? <Play className="m-auto h-full" size={22} /> : <Maximize2 className="m-auto h-full" size={22} />}
            </button>
          ))}
        </div>
      </div>

      {zoomed && active?.type === "image" && (
        <div role="dialog" aria-modal="true" aria-label={`Zoomed view of ${product.name}`} className="fixed inset-0 z-[120] grid place-items-center bg-black/85 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setZoomed(false); }}>
          <button type="button" onClick={() => setZoomed(false)} aria-label="Close zoom" className="absolute right-5 top-5 grid h-12 w-12 place-items-center rounded-full bg-white text-black"><X size={20} /></button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={active.url} alt={active.alt} className="max-h-[90vh] max-w-[95vw] object-contain" />
        </div>
      )}
    </>
  );
}
