# Route map

The app uses Next.js App Router file-based routes.

## Admin labels
- URL: `/BaebeAdmin/products/labels`
- Entry: `src/app/BaebeAdmin/(protected)/products/labels/page.tsx`
- Layout: `src/app/BaebeAdmin/(protected)/layout.tsx` → `src/components/admin/AdminWorkspaceShell.tsx`
- Rendered feature: `src/components/admin/products/LabelPrintWorkspace.tsx`

## Admin workspace
- `/BaebeAdmin` → `src/app/BaebeAdmin/(protected)/page.tsx`
- `/BaebeAdmin/products` → `src/app/BaebeAdmin/(protected)/products/page.tsx`
- `/BaebeAdmin/orders` → `src/app/BaebeAdmin/(protected)/orders/page.tsx`
- `/BaebeAdmin/customers` → `src/app/BaebeAdmin/(protected)/customers/page.tsx`
- `/BaebeAdmin/stores` → `src/app/BaebeAdmin/(protected)/stores/page.tsx`
- `/BaebeAdmin/password` → `src/app/BaebeAdmin/(protected)/password/page.tsx`
- `/BaebeAdmin/login` → `src/app/BaebeAdmin/login/page.tsx`

## Counter workspace
- `/BaebeCounter` → `src/app/BaebeCounter/(protected)/page.tsx`
- `/BaebeCounter/sales` → `src/app/BaebeCounter/(protected)/sales/page.tsx`
- `/BaebeCounter/stock` → `src/app/BaebeCounter/(protected)/stock/page.tsx`
- `/BaebeCounter/password` → `src/app/BaebeCounter/(protected)/password/page.tsx`
- `/BaebeCounter/login` → `src/app/BaebeCounter/login/page.tsx`

