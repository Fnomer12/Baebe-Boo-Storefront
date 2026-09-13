# Key page dependency trees

## `/BaebeAdmin/products/labels` — Print shelf labels

Entry: `src/app/BaebeAdmin/(protected)/products/labels/page.tsx`

Dependencies:
- `src/components/admin/products/LabelPrintWorkspace.tsx`
  - `src/domain/money.ts`
  - `src/lib/labels/local-printer.ts`
  - `src/lib/labels/webusb-print.ts`
  - `src/components/printer/DirectUsbSetup.tsx`
    - `src/lib/labels/webusb-print.ts`
  - `src/components/printer/DriverDownloadCard.tsx`
  - `src/components/printer/TillSetupHelp.tsx`
  - `src/lib/admin-workspace.ts` (via the parent shell)
- `src/app/BaebeAdmin/(protected)/layout.tsx`
  - `src/components/admin/AdminWorkspaceShell.tsx`
    - `src/lib/admin-workspace.ts`
    - `src/lib/supabase.ts`
- `src/app/globals.css`

The target is a protected desktop/mobile admin workspace. The labels page first shows a printer verification panel; after confirmation it shows a searchable image-box product grid. Selecting a product expands its variants with checkboxes, prices, and copy controls, while a sticky print summary keeps the selected labels and print action visible.

## `/BaebeCounter/sales` — Counter selling

Entry: `src/app/BaebeCounter/(protected)/sales/page.tsx`

Dependencies:
- `src/components/counter/SellWorkspace.tsx`
- `src/components/counter/ScanCameraModal.tsx`
- `src/domain/counter/scan.ts`
- `src/lib/counter/catalog.ts`
- `src/app/globals.css`
