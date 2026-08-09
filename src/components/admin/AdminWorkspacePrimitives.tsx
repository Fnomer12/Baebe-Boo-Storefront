"use client";

import { useId, useRef, type ReactNode } from "react";
import { useDialogBehaviour } from "./use-dialog-behaviour";
import { AlertTriangle, ChevronDown, Inbox, RotateCcw, Search, X } from "lucide-react";

export type AdminTableColumn<Row> = {
  key: string;
  header: ReactNode;
  cell: (row: Row) => ReactNode;
  className?: string;
  /**
   * Short label used in the stacked card layout below `md`, where the header
   * row is gone. Only needed when `header` is not a plain string.
   */
  label?: string;
};

function columnLabel<Row>(column: AdminTableColumn<Row>) {
  if (column.label) return column.label;
  return typeof column.header === "string" ? column.header : column.key;
}

/**
 * A table that becomes a list of cards on a narrow screen.
 *
 * This used to be a fixed `min-w-[38rem]` inside a horizontal scroller, which
 * on a tablet till meant swiping sideways to read a stock count — and on the
 * counter it was worse than that: `globals.css` carries a
 * `.counter-shell .admin-table td` rule raising the touch targets, but this
 * component is Tailwind-classed and never set `.admin-table`, so that rule had
 * never applied to a single row.
 *
 * The stacking is done in CSS on ONE set of markup rather than by rendering a
 * card list and a table side by side. Rendering both would duplicate every
 * button in every cell, which breaks accessible-name lookups — one
 * "Add one Bear Hoodie" becomes two, and any test or screen reader has to
 * disambiguate between two controls that do the same thing.
 */
export function AdminDataTable<Row>({
  rows,
  columns,
  rowKey,
  caption,
}: {
  rows: readonly Row[];
  columns: readonly AdminTableColumn<Row>[];
  rowKey: (row: Row) => string;
  caption: string;
}) {
  return (
    <div className="admin-datatable-wrap rounded-3xl border border-black/[0.07] bg-white shadow-sm">
      <table className="admin-datatable w-full border-collapse text-left">
        <caption className="sr-only">{caption}</caption>
        <thead className="border-b border-black/[0.07] bg-[#f8fafb] text-[11px] font-semibold uppercase tracking-[0.14em] text-black/45">
          <tr>
            {columns.map((column) => (
              <th key={column.key} scope="col" className={`px-5 py-4 ${column.className ?? ""}`}>
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-black/[0.06]">
          {rows.map((row) => (
            <tr key={rowKey(row)} className="transition hover:bg-[#f8fafb]">
              {columns.map((column) => (
                <td
                  key={column.key}
                  data-label={columnLabel(column)}
                  className={`px-5 py-4 text-sm ${column.className ?? ""}`}
                >
                  {column.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AdminFilterBar({
  query,
  onQueryChange,
  queryLabel = "Search workspace",
  placeholder = "Search…",
  children,
  actions,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  queryLabel?: string;
  placeholder?: string;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-3xl border border-black/[0.07] bg-white p-3 shadow-sm lg:flex-row lg:items-center">
      <label className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-2xl bg-[#f3f5f7] px-4">
        <Search size={17} className="shrink-0 text-black/40" />
        <span className="sr-only">{queryLabel}</span>
        <input
          type="search"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder={placeholder}
          className="w-full bg-transparent text-sm outline-none placeholder:text-black/35"
        />
      </label>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
      {actions && <div className="flex flex-wrap items-center gap-2 lg:ml-auto">{actions}</div>}
    </div>
  );
}

export function AdminEmptyState({
  title,
  description,
  action,
  icon = <Inbox size={24} />,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-dashed border-black/15 bg-white px-6 py-14 text-center">
      <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[#eaf6fb] text-[#25617c]">{icon}</div>
      <h2 className="mt-5 text-xl font-semibold">{title}</h2>
      <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-black/50">{description}</p>
      {action && <div className="mt-6 flex justify-center">{action}</div>}
    </section>
  );
}

export function AdminErrorState({
  title = "This workspace could not load",
  description,
  onRetry,
}: {
  title?: string;
  description: string;
  onRetry?: () => void;
}) {
  return (
    <section role="alert" className="rounded-3xl border border-red-200 bg-red-50 px-6 py-8">
      <div className="flex items-start gap-4">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white text-red-700 shadow-sm">
          <AlertTriangle size={21} />
        </span>
        <div className="min-w-0">
          <h2 className="font-semibold text-red-950">{title}</h2>
          <p className="mt-1 text-sm leading-6 text-red-900/65">{description}</p>
          {onRetry && (
            <button type="button" onClick={onRetry} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-red-950 px-4 py-2 text-sm font-semibold text-white">
              <RotateCcw size={15} />
              Try again
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

const adminModalWidths = {
  sm: "max-w-md",
  md: "max-w-2xl",
  lg: "max-w-4xl",
  xl: "max-w-6xl",
  // A long-form editor (a parenting article, with body copy and a related
  // product picker) needs the screen, not a column. Still a modal — same focus
  // trap, same Escape, same scroll lock — just sized to the work.
  full: "max-w-none w-full sm:w-[calc(100%-2rem)] lg:w-[calc(100%-8rem)] max-h-[95dvh]",
} as const;

export type AdminModalSize = keyof typeof adminModalWidths;

/**
 * The one overlay every creation flow uses.
 *
 * `size` defaults to `"sm"` — the hardcoded `max-w-md` this component shipped
 * with — so the six screens that already used it are unchanged. `"xl"` exists
 * for the product editor, where a variant matrix is a table and a table does
 * not fit in a phone-width column.
 *
 * The keyboard and focus handling below is not polish. This modal is now the
 * only way to create a store, a staff member, a product or a promotion, and a
 * non-technical user reaches for Escape long before they find a close button.
 * Trapping focus matters for the same reason: without it, Tab walks out of the
 * dialog and into the page behind, and the next Enter presses a button the
 * user cannot see.
 */
export function AdminModal({
  open,
  onClose,
  title,
  subtitle,
  children,
  size = "sm",
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  size?: AdminModalSize;
  /** Pinned below the scrolling body, so Save stays reachable on a long form. */
  footer?: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const headingId = useId();

  // Escape, focus trapping, focus restore and scroll lock — shared with the
  // one overlay that needs its own markup (the parenting article editor), so
  // both behave like dialogs rather than only looking like them.
  useDialogBehaviour(open, panelRef, onClose);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        onClick={onClose}
        className="absolute inset-0 bg-[var(--color-ink)]/20 backdrop-blur-sm"
        aria-label="Close modal"
        tabIndex={-1}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        tabIndex={-1}
        // `dvh`, not `vh`: on phone browsers `vh` is the toolbar-collapsed
        // viewport, so a 90vh panel ran under the URL bar and hid the footer —
        // the Save button a long form pins down there.
        className={`relative z-10 flex max-h-[90dvh] w-full flex-col rounded-3xl border border-[var(--color-line)] bg-[var(--color-surface)] shadow-2xl outline-none ${adminModalWidths[size]}`}
      >
        <div className="flex items-start justify-between gap-4 p-6 pb-4">
          <div className="min-w-0">
            {subtitle && (
              <p className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--color-brand-deep)" }}>
                {subtitle}
              </p>
            )}
            <h2 id={headingId} className={`font-semibold ${subtitle ? "mt-1 text-2xl" : "text-2xl"}`}>
              {title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-[var(--color-line)] bg-[var(--color-cream)]"
          >
            <X size={18} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pb-6">{children}</div>
        {footer && (
          <div className="border-t border-[var(--color-line)] bg-[var(--color-cream)]/60 px-6 py-4">{footer}</div>
        )}
      </div>
    </div>
  );
}

export function AdminSelect({
  children,
  className = "",
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select className={`admin-input admin-select ${className}`} {...props}>
        {children}
      </select>
      <ChevronDown
        size={16}
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2"
        aria-hidden="true"
        style={{ color: "var(--color-ink-soft)" }}
      />
    </div>
  );
}
