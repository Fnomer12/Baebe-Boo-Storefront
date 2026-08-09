"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";

type Consent = "all" | "essential";

export default function ConsentBanner() {
  const pathname = usePathname();
  const [choice, setChoice] = useState<Consent | null>();
  const banner = useRef<HTMLElement>(null);

  useEffect(() => {
    const stored = window.localStorage.getItem("baebe_consent_v1");
    queueMicrotask(() =>
      setChoice(stored === "all" || stored === "essential" ? stored : null),
    );
  }, []);

  // The banner is fixed, so without this it permanently covers the bottom of
  // every page — on a phone that is a whole card's worth of content, with no
  // way to scroll past it. Reserve exactly its height for as long as it shows.
  useEffect(() => {
    const element = banner.current;
    if (!element) return;
    const apply = () => {
      document.body.style.paddingBottom = `${element.offsetHeight + 16}px`;
    };
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(element);
    window.addEventListener("resize", apply);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", apply);
      document.body.style.paddingBottom = "";
    };
  }, [choice]);

  // Back-office and counter screens are operational tools, not analytics
  // surfaces. Keeping the storefront consent prompt out of them prevents it
  // from obscuring login controls and order-management actions.
  if (pathname.startsWith("/BaebeAdmin") || pathname.startsWith("/BaebeCounter")) {
    return null;
  }

  if (choice !== null) return null;

  function save(value: Consent) {
    window.localStorage.setItem("baebe_consent_v1", value);
    window.dispatchEvent(new CustomEvent("baebe_consent_changed", { detail: value }));
    setChoice(value);
  }

  return (
    <aside ref={banner} aria-label="Privacy choices" className="fixed inset-x-2 bottom-2 z-[100] mx-auto flex max-w-xl flex-col gap-2.5 rounded-2xl border border-black/5 bg-white/95 p-3 shadow-[0_10px_40px_rgba(32,29,28,0.16)] backdrop-blur sm:bottom-3 sm:flex-row sm:items-center sm:gap-3 sm:py-2.5 sm:pl-4 sm:pr-2.5">
      <p className="flex-1 text-xs leading-5 text-black/60">
        <span className="font-semibold text-black/80">Your privacy matters.</span> Essential storage keeps your cart working; analytics is optional and helps us improve.
      </p>
      <div className="flex shrink-0 items-center gap-2">
        <button onClick={() => save("essential")} className="flex-1 rounded-full border border-black/10 px-3.5 py-2 text-xs font-semibold transition hover:bg-black/5 sm:flex-none">Essential only</button>
        <button onClick={() => save("all")} className="flex-1 rounded-full bg-black px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-neutral-800 sm:flex-none">Allow analytics</button>
        {/* Dismissing is not a third answer: it records the same essential-only
            choice as the explicit button, so closing the prompt can never be
            read as consent to analytics. Without this the prompt is inescapable
            — it sits over the page on every route until one of the two buttons
            is pressed. */}
        <button
          onClick={() => save("essential")}
          aria-label="Dismiss and keep essential storage only"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-black/40 transition hover:bg-black/5 hover:text-black/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/30"
        >
          <X size={15} aria-hidden />
        </button>
      </div>
    </aside>
  );
}
