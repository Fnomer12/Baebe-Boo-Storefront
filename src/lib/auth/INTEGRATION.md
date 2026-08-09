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

## Route Handlers use the API guards, not the `require*` guards

`requireAdmin()` and `requireCounter()` call `redirect()`. In a Route Handler
that throws `NEXT_REDIRECT`, which a `fetch` sees as a 307 to an HTML login
page — not something the caller can act on, and for a POST it silently drops
the request body. Route Handlers must use:

- `authorizeAdminApi(capability)` — returns `{ authorized, admin | response }`
- `authorizeCounterApi()` — returns `{ authorized, counter | response }`

Both fail closed with a JSON 401. `authorizeCounterApi` takes no capability
argument: `shop_staff` has no role column, so every counter session has
identical rights inside its own shop, and the shop scoping *is* the
authorization.

## Never take a shop id or staff id from the request

Counter handlers read both from `authorization.counter.staff.*` and pass the
shop id as a query filter. No counter request schema contains either field, and
nothing in `src/components/counter/` reads `sessionStorage`. Both are checkable:

```bash
grep -rn "sessionStorage\|shopId\|shop\.id" src/components/counter/   # expect no matches
```
