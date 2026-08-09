/* eslint-disable @next/next/no-img-element */
"use client";

import { useRef } from "react";
import Link from "next/link";
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import { ageRanges } from "./catalog-data";

// Age cards live in a horizontal scroll row; the prev/next buttons nudge it by
// ~80% of the visible width so browsing works with a mouse or keyboard too.
export default function AgeCarousel() {
  const rowRef = useRef<HTMLDivElement>(null);

  const nudge = (direction: 1 | -1) => {
    const el = rowRef.current;
    if (!el) return;
    el.scrollBy({ left: el.clientWidth * 0.8 * direction, behavior: "smooth" });
  };

  return (
    <div className="storefront-age-carousel">
      <div className="storefront-age-nav">
        <button type="button" aria-label="Scroll ages left" onClick={() => nudge(-1)}>
          <ChevronLeft size={18} />
        </button>
        <button type="button" aria-label="Scroll ages right" onClick={() => nudge(1)}>
          <ChevronRight size={18} />
        </button>
      </div>
      <div className="storefront-age-row" ref={rowRef}>
        {ageRanges.map((age) => (
          <Link key={age.slug} href={`/age/${age.slug}`} className="storefront-age-card">
            <img src={`/age/${age.slug}.jpg`} alt={`${age.name} — ${age.detail}`} loading="lazy" />
            <span><strong>{age.name}</strong><small>{age.detail}</small></span>
            <ArrowRight size={16} />
          </Link>
        ))}
      </div>
    </div>
  );
}
