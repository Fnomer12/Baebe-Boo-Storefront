import { describe, expect, it } from "vitest";
import { extractCounterScanSku } from "./scan";

describe("extractCounterScanSku", () => {
  it("keeps a raw barcode SKU unchanged", () => {
    expect(extractCounterScanSku(" BB-SEED-014-01 ")).toBe("BB-SEED-014-01");
  });

  it("extracts the SKU from a customer QR URL", () => {
    expect(
      extractCounterScanSku(
        "https://baebe-boo.jtechinnovations.tech/products/baby-pajamas?sku=BB-SEED-014-01",
      ),
    ).toBe("BB-SEED-014-01");
  });

  it("does not discard an unrecognised scanned value", () => {
    expect(extractCounterScanSku("not-a-url-or-sku")).toBe("not-a-url-or-sku");
  });
});
