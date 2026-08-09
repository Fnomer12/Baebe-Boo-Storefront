"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Power, PowerOff, Tag, Trash2, Wand2, Warehouse } from "lucide-react";
import type { BulkAction, VariantDraft } from "./wizard-state";
import { bulkScopeLabel, bulkTargets } from "./wizard-state";

type ToolKind = "price" | "stock" | "sku" | "activate" | "deactivate" | "remove";

type Shop = { id: string; name: string };

const tools: Array<{ kind: ToolKind; label: string; icon: typeof Tag }> = [
  { kind: "price", label: "Set price", icon: Tag },
  { kind: "stock", label: "Set stock", icon: Warehouse },
  { kind: "sku", label: "Generate SKUs", icon: Wand2 },
  { kind: "activate", label: "Turn on", icon: Power },
  { kind: "deactivate", label: "Turn off", icon: PowerOff },
  { kind: "remove", label: "Remove", icon: Trash2 },
];

/**
 * The bar that makes twelve versions tolerable.
 *
 * Every control opens an INLINE POPOVER and never a second modal. Nesting one
 * `AdminModal` inside another puts two focus traps on the page at once: the
 * inner one steals Tab, the outer one still listens for Escape, and closing
 * either takes the whole form down with the half-filled grid inside it.
 *
 * Scope is stated in words above the buttons — "3 versions selected", or "all
 * 12 versions" — because a bulk action that silently means "everything" is how
 * a seller sets one price across a product they only wanted to fix one row of.
 */
export default function VariantBulkBar({
  rows,
  selected,
  shops,
  onApply,
}: {
  rows: readonly VariantDraft[];
  selected: ReadonlySet<string>;
  shops: readonly Shop[];
  onApply: (action: BulkAction) => void;
}) {
  const [open, setOpen] = useState<ToolKind | null>(null);
  const barRef = useRef<HTMLDivElement | null>(null);

  const scope = bulkScopeLabel(rows, selected);
  const affected = bulkTargets(rows, selected).length;

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      // Swallowed, or Escape closes the wizard behind the popover and the
      // seller loses a grid they have been filling in for five minutes.
      event.stopPropagation();
      setOpen(null);
    }
    function onPointerDown(event: PointerEvent) {
      if (barRef.current?.contains(event.target as Node)) return;
      setOpen(null);
    }
    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [open]);

  function apply(action: BulkAction) {
    onApply(action);
    setOpen(null);
  }

  return (
    <div
      ref={barRef}
      className="relative z-20 flex flex-col gap-2 rounded-2xl border border-[var(--color-line)] bg-[var(--color-cream)]/70 p-3 sm:flex-row sm:items-center sm:justify-between"
    >
      <p aria-live="polite" className="text-sm font-semibold">
        Change {scope}
      </p>
      <div className="flex flex-wrap gap-2">
        {tools.map((tool) => (
          <div key={tool.kind} className="relative">
            <button
              type="button"
              aria-expanded={open === tool.kind}
              aria-haspopup="dialog"
              onClick={() => setOpen((current) => (current === tool.kind ? null : tool.kind))}
              className={`flex min-h-11 items-center gap-1.5 rounded-xl border px-3 text-sm font-semibold transition ${
                open === tool.kind
                  ? "border-[var(--color-brand)] bg-[var(--color-brand-tint)]"
                  : "border-[var(--color-line)] bg-[var(--color-surface)]"
              }`}
            >
              <tool.icon size={15} />
              {tool.label}
            </button>
            {open === tool.kind && (
              <Popover
                kind={tool.kind}
                label={tool.label}
                scope={scope}
                affected={affected}
                shops={shops}
                onApply={apply}
                onCancel={() => setOpen(null)}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function Popover({
  kind,
  label,
  scope,
  affected,
  shops,
  onApply,
  onCancel,
}: {
  kind: ToolKind;
  label: string;
  scope: string;
  affected: number;
  shops: readonly Shop[];
  onApply: (action: BulkAction) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState("");
  const [shopId, setShopId] = useState("");
  const valueId = useId();
  const shopFieldId = useId();
  const headingId = useId();
  const firstFieldRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    firstFieldRef.current?.focus();
  }, []);

  const needsValue = kind === "price" || kind === "stock";

  function confirm() {
    if (kind === "price") onApply({ kind: "price", value: value.trim() });
    else if (kind === "stock")
      onApply({ kind: "stock", value: value.trim(), ...(shopId && { shopId }) });
    else if (kind === "sku") onApply({ kind: "sku" });
    else if (kind === "activate") onApply({ kind: "activate" });
    else if (kind === "deactivate") onApply({ kind: "deactivate" });
    else onApply({ kind: "remove" });
  }

  return (
    <div
      role="dialog"
      aria-labelledby={headingId}
      // Right-anchored so the last buttons in the row cannot push it off a
      // tablet's screen edge, which is where "Remove" always sits.
      className="absolute right-0 top-[calc(100%+0.5rem)] z-30 w-72 rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)] p-4 shadow-xl"
    >
      <h4 id={headingId} className="text-sm font-semibold">
        {label}
      </h4>
      <p className="mt-1 text-xs leading-5 text-[var(--color-ink-soft)]">
        {popoverExplanation(kind, scope, affected)}
      </p>

      {needsValue && (
        <div className="mt-3 space-y-3">
          <div>
            <label htmlFor={valueId} className="admin-label">
              {kind === "price" ? "New price" : "New stock count"}
            </label>
            {kind === "price" ? (
              <div className="relative">
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-[var(--color-ink-soft)]"
                >
                  GH₵
                </span>
                <input
                  ref={firstFieldRef}
                  id={valueId}
                  type="number"
                  min={0}
                  step={0.01}
                  value={value}
                  onChange={(event) => setValue(event.target.value)}
                  className="admin-input pl-14"
                />
              </div>
            ) : (
              <input
                ref={firstFieldRef}
                id={valueId}
                type="number"
                min={0}
                step={1}
                value={value}
                onChange={(event) => setValue(event.target.value)}
                className="admin-input"
              />
            )}
          </div>
          {kind === "stock" && shops.length > 1 && (
            <div>
              <label htmlFor={shopFieldId} className="admin-label">
                Which shop
              </label>
              <select
                id={shopFieldId}
                value={shopId}
                onChange={(event) => setShopId(event.target.value)}
                className="admin-input"
              >
                <option value="">Every shop</option>
                {shops.map((shop) => (
                  <option key={shop.id} value={shop.id}>
                    {shop.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}

      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="admin-button-ghost min-h-11 rounded-xl px-3 text-sm font-semibold"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={confirm}
          disabled={needsValue && value.trim() === ""}
          className="admin-button min-h-11 px-4 text-sm disabled:opacity-45"
        >
          Apply
        </button>
      </div>
    </div>
  );
}

function popoverExplanation(kind: ToolKind, scope: string, affected: number): string {
  const versions = `${affected} ${affected === 1 ? "version" : "versions"}`;
  switch (kind) {
    case "price":
      return `Charges the same for ${scope}. You can still change any one of them afterwards.`;
    case "stock":
      return `Sets the same count on ${scope}. This replaces whatever is there now.`;
    case "sku":
      return `Makes a fresh code for ${versions}, built from the product code and the choices. Codes already printed on labels will change.`;
    case "activate":
      return `Puts ${versions} back on sale in the shop and on the website.`;
    case "deactivate":
      return `Takes ${versions} off sale. The stock and the sales history stay.`;
    case "remove":
      return `Takes ${versions} out of this list. Nothing is deleted until you save, and you can put them back before then.`;
  }
}
