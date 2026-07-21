# Privileged route integration

The guards in this directory are server-only and must run at each privileged
page, Server Action, or Route Handler boundary.

The current `BaebeAdmin/page.tsx` and `BaebeCounter/page.tsx` files are Client
Components. Their parent segment also contains the public `login/page.tsx`, so
adding an authorization check to `BaebeAdmin/layout.tsx` or
`BaebeCounter/layout.tsx` would redirect the login pages too. Next.js layouts
do not receive a reliable pathname with which to distinguish those children.

Integrate without changing public URLs by moving each protected page into a
pathless `(protected)` route group and adding a server layout there:

```tsx
import { requireAdmin } from "@/lib/auth";

export default async function ProtectedAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdmin();
  return children;
}
```

Use `requireCounter()` in the counter route group. Re-run the same guard inside
every privileged Server Action and Route Handler; a page or layout check does
not authorize a separate mutation request.
