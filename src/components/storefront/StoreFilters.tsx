"use client";

import { useEffect } from "react";
import { Baby, Crown, Rainbow, ToyBrick, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type GenderFilter = "all" | "boys" | "girls" | "unisex";
export type PriceBucket = "all" | "under-100" | "100-250" | "250-500" | "over-500";

export type StoreFilterValues = {
  gender: GenderFilter;
  priceBucket: PriceBucket;
  sizes: string[];
  colors: string[];
};

export const emptyStoreFilters: StoreFilterValues = {
  gender: "all",
  priceBucket: "all",
  sizes: [],
  colors: [],
};

const genderOptions: Array<{ value: GenderFilter; label: string; icon: LucideIcon }> = [
  { value: "all", label: "All", icon: ToyBrick },
  { value: "boys", label: "Boys", icon: Baby },
  { value: "girls", label: "Girls", icon: Crown },
  { value: "unisex", label: "Unisex", icon: Rainbow },
];

const priceOptions: Array<{ value: PriceBucket; label: string }> = [
  { value: "all", label: "Any price" },
  { value: "under-100", label: "Under GH₵100" },
  { value: "100-250", label: "GH₵100–250" },
  { value: "250-500", label: "GH₵250–500" },
  { value: "over-500", label: "Over GH₵500" },
];

function toggleValue(list: string[], value: string) {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

export default function StoreFilters({
  open,
  values,
  availableSizes,
  availableColors,
  onChange,
  onClose,
}: {
  open: boolean;
  values: StoreFilterValues;
  availableSizes: string[];
  availableColors: string[];
  onChange: (values: StoreFilterValues) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open, onClose]);

  return (
    <>
      {open && (
        <div
          onClick={onClose}
          className="fixed inset-0 z-[60] bg-black/30 backdrop-blur-sm"
        />
      )}

      <aside
        id="store-filters"
        aria-hidden={!open}
        inert={!open ? true : undefined}
        className={`fixed right-0 top-0 z-[70] h-dvh w-full max-w-[430px] overflow-y-auto bg-[#FDFBF8] shadow-2xl transition-transform duration-500 sm:w-[90%] ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-black/10 bg-[#FDFBF8]/95 px-5 py-5 backdrop-blur-xl sm:px-6">
          <div>
            <h2 className="text-xl font-semibold">Filters</h2>
            <p className="text-sm text-black/50">Refine the collection</p>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close filters"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-black text-white"
          >
            <X size={20} />
          </button>
        </div>

        <div className="space-y-8 px-5 py-6 sm:px-6">
          <div>
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-widest text-black/50">
              Gender
            </h3>

            <div className="grid grid-cols-2 gap-3">
              {genderOptions.map((option) => {
                const Icon = option.icon;
                const active = values.gender === option.value;

                return (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={active}
                    onClick={() => onChange({ ...values, gender: option.value })}
                    className={`flex min-w-0 items-center gap-3 rounded-2xl border px-4 py-4 text-left transition ${
                      active
                        ? "border-black bg-[#DDF2FF] text-black"
                        : "border-black/10 bg-white text-black/60"
                    }`}
                  >
                    <Icon size={21} className="shrink-0" />
                    <span className="truncate font-medium">{option.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-widest text-black/50">
              Price
            </h3>

            <div className="flex flex-wrap gap-3">
              {priceOptions.map((option) => {
                const active = values.priceBucket === option.value;

                return (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={active}
                    onClick={() => onChange({ ...values, priceBucket: option.value })}
                    className={`rounded-full border px-5 py-3 text-sm font-medium transition ${
                      active
                        ? "border-black bg-black text-white"
                        : "border-black/10 bg-white text-black/60"
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>

          {availableSizes.length > 0 && (
            <div>
              <h3 className="mb-4 text-sm font-semibold uppercase tracking-widest text-black/50">
                Size
              </h3>

              <div className="flex flex-wrap gap-3">
                {availableSizes.map((size) => {
                  const active = values.sizes.includes(size);

                  return (
                    <button
                      key={size}
                      type="button"
                      aria-pressed={active}
                      onClick={() => onChange({ ...values, sizes: toggleValue(values.sizes, size) })}
                      className={`rounded-full border px-5 py-3 text-sm font-medium transition ${
                        active
                          ? "border-black bg-black text-white"
                          : "border-black/10 bg-white text-black/60"
                      }`}
                    >
                      {size}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {availableColors.length > 0 && (
            <div>
              <h3 className="mb-4 text-sm font-semibold uppercase tracking-widest text-black/50">
                Colour
              </h3>

              <div className="flex flex-wrap gap-3">
                {availableColors.map((color) => {
                  const active = values.colors.includes(color);

                  return (
                    <button
                      key={color}
                      type="button"
                      aria-pressed={active}
                      onClick={() => onChange({ ...values, colors: toggleValue(values.colors, color) })}
                      className={`rounded-full border px-5 py-3 text-sm font-medium transition ${
                        active
                          ? "border-black bg-black text-white"
                          : "border-black/10 bg-white text-black/60"
                      }`}
                    >
                      {color}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="sticky bottom-0 grid grid-cols-2 gap-3 border-t border-black/10 bg-[#FDFBF8]/95 py-4 backdrop-blur-xl">
            <button
              type="button"
              onClick={() => onChange(emptyStoreFilters)}
              className="h-14 rounded-full border border-black/10 bg-white text-sm font-semibold text-black"
            >
              Clear
            </button>

            <button
              type="button"
              onClick={onClose}
              className="h-14 rounded-full bg-black text-sm font-semibold text-white"
            >
              Done
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
