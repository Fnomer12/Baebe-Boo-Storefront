# Extractable components

## AdminWorkspaceShell
- Source: `src/components/admin/AdminWorkspaceShell.tsx`
- Category: layout
- Description: Responsive protected admin shell with sidebar and sign-out.
- Extractable props: `activeTab` (string, default `dashboard`), `navigationOpen` (boolean, default `false`).
- Hardcoded: Baebe Boo wordmark text, route labels/icons, protected-workspace badge, sign-out copy, all CSS classes.

## AdminDataTable
- Source: `src/components/admin/AdminWorkspacePrimitives.tsx`
- Category: basic
- Description: Responsive admin table/card list.
- Extractable props: `rows`, `columns`, `caption`.
- Hardcoded: table layout, border/shadow treatment, responsive class names.

## AdminFilterBar
- Source: `src/components/admin/AdminWorkspacePrimitives.tsx`
- Category: basic
- Description: Search field with optional filter and action slots.
- Extractable props: `query`, `onQueryChange`, `queryLabel`, `placeholder`.
- Hardcoded: search icon, field treatment, spacing and responsive layout.

## AdminModal
- Source: `src/components/admin/AdminWorkspacePrimitives.tsx`
- Category: basic
- Description: Focus-managed admin dialog.
- Extractable props: `open`, `title`, `subtitle`, `size`, `footer`.
- Hardcoded: overlay, close icon, card treatment, focus behavior.

