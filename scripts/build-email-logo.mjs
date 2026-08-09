/**
 * Derive the small logo assets that email and the PDF receipt need.
 *
 * The only brand image in the repo is `public/baebe-boo.jpg`, which is:
 *   - PNG bytes despite the `.jpg` name (Next infers `Content-Type` from the
 *     extension, so it is served as `image/jpeg` — one reason not to point an
 *     email client at it directly)
 *   - 910x1306 portrait, with the artwork occupying 768x1148 of that
 *   - 352 KB, and fully opaque: a solid white background, which is why every
 *     on-site usage crops it into a circle on a `bg-white` wrapper
 *
 * None of that suits an email header or a PDF, so this produces two
 * derivatives. Both outputs are COMMITTED — this script is a recipe you re-run
 * by hand when the artwork changes, never part of the build. `next build` is
 * already the heaviest thing that runs on this box, and a checked-in asset has
 * no failure modes.
 *
 *   node scripts/build-email-logo.mjs
 *
 * To ship new artwork, replace the source, re-run this, and RENAME the outputs
 * (`logo-email-2.png`) updating the reference in `src/lib/email/templates.ts`.
 * The email asset is served with a 30-day `Cache-Control`, so a stable filename
 * would leave image proxies serving the old mark for a month.
 */
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = resolve(root, "public/baebe-boo.jpg");

const emailLogo = resolve(root, "public/logo-email.png");
const pdfLogo = resolve(root, "public/brand/baebe-boo-logo.jpg");

/**
 * Email: transparent PNG, 162x240, displayed at 54x80 so it is exactly 3x and
 * stays crisp on retina.
 *
 * THE ORDERING IS LOAD-BEARING. `unflatten()` must run BEFORE `resize()`.
 * Unflattening first turns pure white into alpha 0 while the edges are still
 * hard, and the downscale then anti-aliases them into clean partial alpha.
 * Resizing first blends white into every edge pixel, leaving roughly 1,300
 * near-white but fully opaque pixels — a visible white fringe around the mark
 * on any backdrop that is not white.
 *
 * Transparent rather than white-matted: the card behind it IS white, so a matte
 * would be invisible there, but a dark-mode client that inverts the card would
 * turn a matte into a white rectangle.
 */
async function buildEmailLogo() {
  return sharp(source)
    .trim({ background: "#ffffff", threshold: 10 })
    .unflatten()
    .resize({
      width: 162,
      height: 240,
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png({ compressionLevel: 9, palette: true, quality: 90, effort: 10 })
    .toFile(emailLogo);
}

/**
 * PDF: opaque JPEG, 320px tall, drawn at ~46pt.
 *
 * JPEG rather than PNG on purpose, and it is not a micro-optimisation. PDFKit
 * embeds a JPEG by scanning its markers and passing the bytes straight through
 * as DCTDecode. An RGBA PNG instead goes through `splitAlphaChannel()`, which
 * inflates the full 910x1306x4 (~4.75 MB) pixel buffer and re-deflates it
 * twice — on an async callback, on every paid order.
 *
 * Flattened against white because the receipt page is white anyway, and JPEG
 * has no alpha channel to preserve.
 */
async function buildPdfLogo() {
  await mkdir(dirname(pdfLogo), { recursive: true });

  return sharp(source)
    .trim({ background: "#ffffff", threshold: 10 })
    .flatten({ background: "#ffffff" })
    .resize({ height: 320 })
    .jpeg({ quality: 88, chromaSubsampling: "4:4:4" })
    .toFile(pdfLogo);
}

const [email, pdf] = await Promise.all([buildEmailLogo(), buildPdfLogo()]);

console.log(`public/logo-email.png            ${email.width}x${email.height}  ${email.size} bytes`);
console.log(`public/brand/baebe-boo-logo.jpg  ${pdf.width}x${pdf.height}  ${pdf.size} bytes`);
console.log("\nBoth assets are committed. Re-run only when the source artwork changes.");
