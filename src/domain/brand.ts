/**
 * The Baebe Boo palette, as literal hexes.
 *
 * `src/app/globals.css` is the source of truth for the *site*, where these are
 * CSS custom properties and must stay that way. This module exists for the
 * places a custom property cannot reach:
 *
 *   - transactional email — Outlook's Word engine has no `var()`, and Gmail
 *     strips `:root` entirely
 *   - the generated PDF receipt, where colours are drawing instructions
 *
 * THE BUG THIS FIXES
 * ------------------
 * `src/lib/email/templates.ts` hard-coded `brandColor = "#28637d"` — a dark
 * teal belonging to the legacy admin portal, not to the storefront. So every
 * customer email (receipts, sign-in codes, birthday campaigns) sent a teal
 * wordmark and a teal button while the shop itself was rose. Nothing caught it
 * because nothing connected the two sets of literals.
 *
 * Duplication is the point here; drift is the danger. `brand.test.ts` reads
 * `globals.css` and fails if these two ever disagree, so changing a brand
 * colour means changing both or neither.
 */
export const BRAND = {
  /** Text, headings, and the fill behind white button labels. */
  ink: "#1c1518",
  /** Muted body copy. */
  inkSoft: "#6b6167",
  /** Cards. */
  surface: "#ffffff",
  /** The warm page canvas. */
  cream: "#fbf6f3",
  /** The logo rose. Decoration only — see the contrast note below. */
  brand: "#cf7d95",
  /** The accessible rose: links, discount amounts, emphasis. */
  brandDeep: "#b0617a",
  /** Blush surface for tinted blocks. */
  brandTint: "#f7e7ec",

  /**
   * `--color-line` is `rgba(28,21,24,.1)`, and Outlook's Word engine drops rgba
   * borders altogether rather than approximating them. These are that value
   * pre-blended against the two backgrounds it is ever drawn on, so email and
   * PDF get the same hairline the site does.
   */
  lineOnSurface: "#e8e8e8",
  lineOnCream: "#e5e0dd",
} as const;

/**
 * Contrast, measured against WCAG 2.1. These are not stylistic preferences.
 *
 *   ink on surface            17.95:1  AAA   body text, headings
 *   surface on ink            17.95:1  AAA   the primary button
 *   ink on brandTint          15.04:1  AAA   tinted blocks
 *   inkSoft on surface         5.95:1  AA    muted copy
 *   brandDeep on surface       4.34:1  AA-large — links, discount amounts
 *   brand on surface           2.99:1  FAILS everything
 *
 * So `brand` is decoration only: rules, the logo, tint fills. Never text, and
 * never a fill behind text — white on `brand` is also 2.99:1, which is why the
 * primary call to action is `ink`, matching every primary control on the
 * storefront.
 */
export const BRAND_CONTRAST_NOTE = "brand is decoration only; use brandDeep for text" as const;
