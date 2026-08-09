import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { BRAND } from "./brand";

const globalsCss = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "../app/globals.css"),
  "utf8",
);

/**
 * `BRAND` is a deliberate second copy of the storefront tokens, because email
 * and PDF cannot read a CSS custom property. This suite is what makes that copy
 * safe: it fails the moment the two disagree, so a brand colour can only be
 * changed in both places or neither.
 */
describe("the brand palette", () => {
  it.each([
    ["--color-ink", BRAND.ink],
    ["--color-ink-soft", BRAND.inkSoft],
    ["--color-surface", BRAND.surface],
    ["--color-cream", BRAND.cream],
    ["--color-brand", BRAND.brand],
    ["--color-brand-deep", BRAND.brandDeep],
    ["--color-brand-tint", BRAND.brandTint],
  ])("declares the same value as %s in globals.css", (token, hex) => {
    expect(globalsCss).toContain(`${token}: ${hex};`);
  });

  it("never reintroduces the legacy admin teal the emails used to send", () => {
    expect(Object.values(BRAND)).not.toContain("#28637d");
  });

  it("pre-blends the hairlines, because Outlook drops rgba borders rather than approximating them", () => {
    // globals.css keeps the hairline as rgba so it composites over anything.
    // Email and PDF need it already flattened against the two backgrounds it
    // is drawn on — proven here rather than trusted.
    expect(globalsCss).toContain("--color-line: rgba(28, 21, 24, 0.1);");
    expect(blendOver(BRAND.lineOnSurface, BRAND.surface)).toBe(true);
    expect(blendOver(BRAND.lineOnCream, BRAND.cream)).toBe(true);
  });
});

/** Is `flattened` what 10% ink over `background` actually produces? */
function blendOver(flattened: string, background: string): boolean {
  const ink = [0x1c, 0x15, 0x18];
  const base = hexToRgb(background);
  const expected = ink.map((channel, index) =>
    Math.round(channel * 0.1 + base[index]! * 0.9),
  );
  // One unit of rounding slack per channel: the tokens are hand-authored, and
  // a colour nobody can distinguish is not worth failing a build over.
  return hexToRgb(flattened).every(
    (channel, index) => Math.abs(channel - expected[index]!) <= 1,
  );
}

function hexToRgb(hex: string): number[] {
  const value = hex.replace("#", "");
  return [0, 2, 4].map((offset) => parseInt(value.slice(offset, offset + 2), 16));
}
