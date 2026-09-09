/**
 * Barcode scanners usually behave like keyboards, while QR scanners may type
 * the full product URL. Both formats carry the variant SKU on our stickers.
 */
export function extractCounterScanSku(value: string): string {
  const raw = value.trim();
  if (!raw) return "";

  try {
    const url = new URL(raw);
    return url.searchParams.get("sku")?.trim() || raw;
  } catch {
    return raw;
  }
}
