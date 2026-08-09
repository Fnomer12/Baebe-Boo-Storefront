import "server-only";

import { readFileSync } from "node:fs";
import { join } from "node:path";

export class ReceiptAssetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReceiptAssetError";
  }
}

export type ReceiptAssets = {
  regular: Buffer;
  bold: Buffer;
  /** Null when the logo is unreadable — a receipt without it is still a receipt. */
  logo: Buffer | null;
};

let cached: ReceiptAssets | null = null;

function tryRead(relativePath: string): Buffer | null {
  try {
    // Built at runtime from `process.cwd()` on purpose: nothing here is
    // statically analysable, so webpack cannot try to bundle or trace it. pm2
    // pins `cwd` to the repo root in `ecosystem.config.cjs`, and `next start`,
    // `next dev` and vitest all run from there too.
    return readFileSync(join(process.cwd(), relativePath));
  } catch {
    return null;
  }
}

/**
 * The fonts and artwork the PDF receipt draws with.
 *
 * WHY THE FONTS ARE VENDORED AT ALL
 * ---------------------------------
 * The Ghanaian cedi sign is ₵ (U+20B5), and PDFKit's built-in Helvetica is
 * WinAnsi-encoded — it has no such glyph. Drawing `GH₵360.75` with a standard
 * font produces a blank or the wrong mark exactly where the amount paid goes.
 * Plus Jakarta Sans is both the brand face and carries U+20B5, so embedding it
 * solves the branding and the correctness problem at once.
 *
 * FAILING ASYMMETRICALLY, ON PURPOSE
 * ----------------------------------
 * A missing logo degrades to a wordmark-only header that nobody will notice. A
 * missing font silently corrupts the one number on the page that matters, so
 * that refuses instead. Better no receipt than a receipt with a hole where the
 * total should be.
 *
 * Lazy rather than read-at-import so an asset problem is a catchable exception
 * on one call, instead of taking out module evaluation for every route in the
 * chunk — including during `next build`'s route collection. Memoised only after
 * success, so a transient read failure retries on the next order rather than
 * poisoning the process until someone restarts pm2.
 */
export function loadReceiptAssets(): ReceiptAssets {
  if (cached) return cached;

  const regular = tryRead("src/lib/pdf/fonts/PlusJakartaSans-Regular.ttf");
  const bold = tryRead("src/lib/pdf/fonts/PlusJakartaSans-Bold.ttf");

  if (!regular || !bold) {
    throw new ReceiptAssetError(
      "Receipt fonts are missing from the deployment (src/lib/pdf/fonts). " +
        "Without them the cedi sign cannot be rendered.",
    );
  }

  cached = { regular, bold, logo: tryRead("public/brand/baebe-boo-logo.jpg") };
  return cached;
}

/** Test seam. Never call this from application code. */
export function resetReceiptAssetsCache(): void {
  cached = null;
}
