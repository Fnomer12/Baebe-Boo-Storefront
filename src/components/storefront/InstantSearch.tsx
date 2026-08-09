/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2, Search } from "lucide-react";
import { formatPrice } from "./catalog-data";

type Result = { id: string; name: string; slug: string; category: string; price: number; imageUrl: string };

// Instant (as-you-type) product search. Debounced fetch to /api/search with a
// cancellable request, keyboard navigation, and a "see all" fallback to /store.
export default function InstantSearch({
  variant = "panel",
  autoFocus = false,
  onNavigate,
}: {
  variant?: "panel" | "overlay";
  autoFocus?: boolean;
  onNavigate?: () => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const q = query.trim();
    const handle = setTimeout(async () => {
      if (q.length < 2) {
        setResults([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: controller.signal });
        const json = (await res.json()) as { results?: Result[] };
        setResults(Array.isArray(json.results) ? json.results : []);
        setOpen(true);
        setActive(-1);
      } catch (error) {
        if ((error as Error).name !== "AbortError") setResults([]);
      } finally {
        setLoading(false);
      }
    }, q.length < 2 ? 0 : 200);
    return () => clearTimeout(handle);
  }, [query]);

  useEffect(() => {
    const onDoc = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const go = (slug: string) => {
    onNavigate?.();
    router.push(`/products/${slug}`);
  };
  const goAll = () => {
    const q = query.trim();
    onNavigate?.();
    router.push(q ? `/store?q=${encodeURIComponent(q)}` : "/store");
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((a) => Math.min(a + 1, results.length - 1));
      setOpen(true);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((a) => Math.max(a - 1, -1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (active >= 0 && results[active]) go(results[active].slug);
      else goAll();
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  };

  const showDropdown = open && query.trim().length >= 2;

  return (
    <div ref={rootRef} className={`storefront-instant-search storefront-instant-${variant}`}>
      <div className="storefront-search-field">
        <Search size={18} />
        <input
          value={query}
          autoFocus={autoFocus}
          onChange={(event) => setQuery(event.target.value)}
          onFocus={() => query.trim().length >= 2 && setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Search clothing, shoes, toys…"
          aria-label="Search products"
          role="combobox"
          aria-expanded={showDropdown}
          aria-controls="instant-search-results"
        />
        {loading ? (
          <Loader2 size={18} className="animate-spin opacity-60" />
        ) : (
          <button type="button" aria-label="Search" onClick={goAll}><ArrowRight size={18} /></button>
        )}
      </div>
      {showDropdown && (
        <div className="storefront-search-results" id="instant-search-results" role="listbox">
          {results.length ? (
            <>
              {results.map((result, index) => (
                <Link
                  key={result.id}
                  href={`/products/${result.slug}`}
                  role="option"
                  aria-selected={index === active}
                  onClick={() => onNavigate?.()}
                  className={`storefront-search-result${index === active ? " is-active" : ""}`}
                >
                  <span className="storefront-search-thumb">{result.imageUrl ? <img src={result.imageUrl} alt="" loading="lazy" /> : null}</span>
                  <span className="storefront-search-meta"><strong>{result.name}</strong><small>{result.category}</small></span>
                  <span className="storefront-search-price">{formatPrice(result.price)}</span>
                </Link>
              ))}
              <button type="button" className="storefront-search-all" onClick={goAll}>
                See all results for “{query.trim()}” <ArrowRight size={15} />
              </button>
            </>
          ) : (
            !loading && (
              <div className="storefront-search-empty">
                <p>No matches for “{query.trim()}”.</p>
                <button type="button" onClick={goAll}>Browse the full store <ArrowRight size={14} /></button>
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}
