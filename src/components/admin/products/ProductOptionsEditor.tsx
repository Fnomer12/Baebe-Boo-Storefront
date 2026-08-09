"use client";

import { useId, useState, type KeyboardEvent } from "react";
import { Plus, X } from "lucide-react";
import { maxOptionsPerProduct } from "@/domain/catalog/product-options";
import { AdminHint, HintedLabel } from "@/components/admin/AdminHint";
import {
  variantCountSentence,
  type OptionDraft,
  type VariantCountSummary,
} from "./wizard-state";

/**
 * The names sellers actually use, offered but not enforced.
 *
 * A `<datalist>` rather than a `<select>` on purpose: `products.options` is
 * free text and somebody will legitimately need "Flavour" or "Length". The
 * list exists so that the four common ones are spelled the same way every
 * time, because two products with "Color" and "Colour" are two products the
 * storefront cannot group.
 */
const suggestedOptionNames = ["Colour", "Size", "Material", "Pack size"];

function ValueChips({
  option,
  index,
  onChange,
}: {
  option: OptionDraft;
  index: number;
  onChange: (values: string[]) => void;
}) {
  const [entry, setEntry] = useState("");
  const inputId = useId();
  const label = option.name.trim() || "this option";

  function commit(raw: string) {
    // Commas as well as Enter: sizes get pasted straight out of a supplier
    // sheet as "3M, 6M, 9M" and typing them again is how they get mistyped.
    const additions = raw
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    if (additions.length === 0) return;
    onChange([...option.values, ...additions]);
    setEntry("");
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" || event.key === ",") {
      // Enter inside a modal would otherwise reach the form and submit it, or
      // reach AdminModal and read as "next step" half-way through a list.
      event.preventDefault();
      commit(entry);
      return;
    }
    if (event.key === "Backspace" && entry.length === 0 && option.values.length > 0) {
      onChange(option.values.slice(0, -1));
    }
  }

  return (
    <div>
      <label htmlFor={inputId} className="admin-label">
        Choices for {label}
      </label>
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)] p-2">
        {option.values.map((value, valueIndex) => (
          <span
            key={`${value}-${valueIndex}`}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-[var(--color-brand-tint)] px-3 text-sm font-semibold"
          >
            {value}
            <button
              type="button"
              onClick={() => onChange(option.values.filter((_, position) => position !== valueIndex))}
              aria-label={`Remove ${value} from ${label}`}
              className="grid h-6 w-6 place-items-center rounded-full text-[var(--color-ink-soft)] hover:bg-black/10"
            >
              <X size={12} />
            </button>
          </span>
        ))}
        <input
          id={inputId}
          value={entry}
          onChange={(event) => setEntry(event.target.value)}
          onKeyDown={onKeyDown}
          // Typed and then abandoned still counts. Somebody who types "Blue"
          // and taps Next without pressing Enter meant to add Blue.
          onBlur={() => commit(entry)}
          placeholder={index === 0 ? "Type a choice and press Enter" : "Add a choice"}
          className="min-h-9 min-w-[10rem] flex-1 bg-transparent px-2 text-sm outline-none placeholder:text-[var(--color-ink-soft)]"
        />
      </div>
    </div>
  );
}

/**
 * Step 3: does this come in different versions, and which ones.
 *
 * The headline is a question rather than a heading because "variable product"
 * is vocabulary from the schema, not from the shop floor. Answering "No" is
 * the common case and has to stay one tap — that is what keeps the wizard
 * usable for the plain products that are most of the catalogue.
 */
export default function ProductOptionsEditor({
  variable,
  options,
  summary,
  onVariableChange,
  onOptionsChange,
}: {
  variable: boolean;
  options: readonly OptionDraft[];
  summary: VariantCountSummary;
  onVariableChange: (variable: boolean) => void;
  onOptionsChange: (options: OptionDraft[]) => void;
}) {
  const datalistId = useId();
  const groupName = useId();

  function update(index: number, patch: Partial<OptionDraft>) {
    onOptionsChange(options.map((option, position) => (position === index ? { ...option, ...patch } : option)));
  }

  return (
    <div className="space-y-6">
      <fieldset>
        <legend className="flex items-center gap-1.5 text-base font-semibold">
          Does this product come in different versions?
          <AdminHint label="What are different versions?">
            Versions are the choices a shopper makes before adding to the basket — pink or
            blue, 3–6 months or 6–12 months. Each one keeps its own price, code and stock.
            Say no if there is only one of this product.
          </AdminHint>
        </legend>
        <p className="mt-1 text-sm leading-6 text-[var(--color-ink-soft)]">
          For example, the same sleepsuit in two colours and three sizes.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {[
            { value: false, label: "No, just one version" },
            { value: true, label: "Yes, it has choices" },
          ].map((choice) => (
            <label
              key={String(choice.value)}
              className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-2xl border px-4 text-sm font-semibold transition ${
                variable === choice.value
                  ? "border-[var(--color-brand)] bg-[var(--color-brand-tint)]"
                  : "border-[var(--color-line)] bg-[var(--color-surface)] text-[var(--color-ink-soft)]"
              }`}
            >
              <input
                type="radio"
                name={groupName}
                className="sr-only"
                checked={variable === choice.value}
                onChange={() => onVariableChange(choice.value)}
              />
              {choice.label}
            </label>
          ))}
        </div>
      </fieldset>

      {variable && (
        <>
          <datalist id={datalistId}>
            {suggestedOptionNames.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>

          <div className="space-y-4">
            {options.map((option, index) => (
              <div
                key={index}
                className="space-y-3 rounded-2xl border border-[var(--color-line)] bg-[var(--color-cream)]/60 p-4"
              >
                <div className="flex items-end gap-3">
                  <div className="min-w-0 flex-1">
                    <HintedLabel
                      label={`Option ${index + 1}`}
                      hint="What the shopper is picking — Colour, Size, Material. Type your own if none of the suggestions fit."
                    />
                    <input
                      value={option.name}
                      list={datalistId}
                      onChange={(event) => update(index, { name: event.target.value })}
                      placeholder="Colour"
                      className="admin-input mt-2"
                      aria-label={`Name of choice ${index + 1}`}
                    />
                  </div>
                  {options.length > 1 && (
                    <button
                      type="button"
                      onClick={() =>
                        onOptionsChange(options.filter((_, position) => position !== index))
                      }
                      aria-label={`Remove choice ${index + 1}`}
                      className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)]"
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>
                <ValueChips
                  option={option}
                  index={index}
                  onChange={(values) => update(index, { values })}
                />
              </div>
            ))}
          </div>

          {options.length < maxOptionsPerProduct && (
            <button
              type="button"
              onClick={() => onOptionsChange([...options, { name: "", values: [] }])}
              className="admin-button-secondary min-h-11 rounded-2xl px-4 text-sm font-semibold"
            >
              <Plus size={15} /> Add another option
            </button>
          )}

          <VersionCount summary={summary} />
        </>
      )}
    </div>
  );
}

/**
 * The sentence that tells the seller what they have just committed to.
 *
 * Amber past fifty and refused past a hundred, and the refusal says what to do
 * about it. "Too many variants" on its own leaves a shop owner deleting
 * choices at random to find the number we would accept.
 */
function VersionCount({ summary }: { summary: VariantCountSummary }) {
  if (summary.count === 0) {
    return (
      <p className="rounded-2xl bg-[var(--color-cream)] px-4 py-3 text-sm leading-6 text-[var(--color-ink-soft)]">
        Add at least one choice above to see how many versions this makes.
      </p>
    );
  }

  const tone =
    summary.level === "refused"
      ? "border-red-300 bg-red-50 text-red-900"
      : summary.level === "crowded"
        ? "border-amber-300 bg-amber-50 text-amber-900"
        : "border-[var(--color-line)] bg-[var(--color-cream)] text-[var(--color-ink)]";

  return (
    <div role="status" className={`rounded-2xl border px-4 py-3 text-sm leading-6 ${tone}`}>
      <p className="font-semibold">{variantCountSentence(summary)}</p>
      {summary.level === "refused" && (
        <p className="mt-1">
          That&apos;s more versions than we can manage in one product. Try splitting it into two
          products.
        </p>
      )}
      {summary.level === "crowded" && (
        <p className="mt-1">
          That is a lot to keep stock for. You can still save it, but check you really sell every
          one of them.
        </p>
      )}
    </div>
  );
}
