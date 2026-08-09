// @vitest-environment node
import { create as createFont, type Font } from "fontkit";
import { beforeEach, describe, expect, it } from "vitest";
import { loadReceiptAssets, resetReceiptAssetsCache } from "./receipt-assets";

beforeEach(() => {
  resetReceiptAssetsCache();
});

/**
 * These guard the two binaries this feature ships. Both are the kind of thing
 * that goes missing quietly — a `.gitignore` rule, a deploy that copies only
 * `.next`, a well-meant "simplification" back to the original artwork — and in
 * every case the first symptom would be a customer receipt.
 */
describe("the receipt assets", () => {
  it("ships both weights of a font that can render the cedi sign", () => {
    const { regular, bold } = loadReceiptAssets();

    for (const [weight, buffer] of [
      ["regular", regular],
      ["bold", bold],
    ] as const) {
      expect(buffer.length, `${weight} font looks truncated`).toBeGreaterThan(100_000);
      const font = createFont(buffer) as Font;
      // Without U+20B5 every amount on the receipt renders as a blank or a box.
      expect(font.hasGlyphForCodePoint(0x20b5), `${weight} has no cedi sign`).toBe(true);
    }
  });

  it("ships a logo PDFKit can embed without decoding pixels", () => {
    const { logo } = loadReceiptAssets();
    expect(logo).not.toBeNull();
    // JPEG magic. PDFKit passes JPEG bytes through as DCTDecode after a marker
    // scan; an RGBA PNG instead inflates a ~4.75 MB pixel buffer and re-deflates
    // it twice, on an async callback, on every paid order. This is the guard
    // against someone pointing it back at `public/baebe-boo.jpg`.
    expect(logo!.readUInt16BE(0)).toBe(0xffd8);
    expect(logo!.length).toBeLessThan(40_000);
  });

  it("hands back the same buffers on a second call rather than re-reading them", () => {
    const first = loadReceiptAssets();
    const second = loadReceiptAssets();
    expect(second.regular).toBe(first.regular);
  });
});
