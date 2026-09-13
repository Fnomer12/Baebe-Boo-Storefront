# Shared UI components

Framework: React 19 + Next.js 16. CSS is Tailwind CSS v4 with custom admin utility classes in `src/app/globals.css`. There is no third-party component library; shared UI is custom React and Lucide icons.

## AdminFilterBar
- Source: `src/components/admin/AdminWorkspacePrimitives.tsx`
- Description: Reusable search/filter surface for admin workspaces.
- Props: `query`, `onQueryChange`, `queryLabel`, `placeholder`, `children`, `actions`.

```tsx
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
        <input type="search" value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder={placeholder} className="w-full bg-transparent text-sm outline-none placeholder:text-black/35" />
      </label>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
      {actions && <div className="flex flex-wrap items-center gap-2 lg:ml-auto">{actions}</div>}
    </div>
  );
}
```

## AdminSelect
- Source: `src/components/admin/AdminWorkspacePrimitives.tsx`
- Description: Admin-styled native select with a consistent chevron.

```tsx
export function AdminSelect({ children, className = "", ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select className={`admin-input admin-select ${className}`} {...props}>{children}</select>
      <ChevronDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2" aria-hidden="true" style={{ color: "var(--color-ink-soft)" }} />
    </div>
  );
}
```

## AdminModal
- Source: `src/components/admin/AdminWorkspacePrimitives.tsx`
- Description: Shared focus-managed modal used by admin creation/editing flows.
- Key props: `open`, `onClose`, `title`, `subtitle`, `children`, `size`, `footer`.

## AdminDataTable
- Source: `src/components/admin/AdminWorkspacePrimitives.tsx`
- Description: Responsive table that becomes stacked cards on narrow screens.
- Key props: `rows`, `columns`, `rowKey`, `caption`.

## AdminEmptyState / AdminErrorState
- Source: `src/components/admin/AdminWorkspacePrimitives.tsx`
- Description: Consistent empty and recoverable error surfaces for admin pages.

