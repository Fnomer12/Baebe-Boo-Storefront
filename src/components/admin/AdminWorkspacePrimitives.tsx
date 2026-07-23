"use client";

import type { ReactNode } from "react";
import { AlertTriangle, Inbox, RotateCcw, Search } from "lucide-react";

export type AdminTableColumn<Row> = {
  key: string;
  header: ReactNode;
  cell: (row: Row) => ReactNode;
  className?: string;
};

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
    <div className="overflow-x-auto rounded-3xl border border-black/[0.07] bg-white shadow-sm">
      <table className="w-full min-w-[44rem] border-collapse text-left">
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
                <td key={column.key} className={`px-5 py-4 text-sm ${column.className ?? ""}`}>
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
      {actions && <div className="flex items-center gap-2 lg:ml-auto">{actions}</div>}
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
