# Baebe Boo admin UI design system

Baebe Boo is a Ghanaian baby and children’s store. Admin and counter tools should feel calm, practical, warm, and dependable while supporting fast operational work on laptop and till-sized screens.

## Visual language

- Keep the existing Baebe Boo rose/charcoal/cream palette. Do not introduce gradients, neon colors, or a competing visual identity.
- Use the existing sans-serif family, compact uppercase eyebrows, strong readable headings, rounded white cards, thin neutral borders, and restrained neutral shadows.
- Prioritize operational clarity: selected states, counts, stock/price metadata, and the next action should be visually obvious.
- Preserve large touch targets (minimum 44px) and responsive layouts that do not require horizontal scrolling.

## Tokens

- Ink `#1c1518`; muted ink `#6b6167`; cream `#fbf6f3`; surface `#ffffff`.
- Brand `#cf7d95`; deep brand `#b0617a`; tint `#f7e7ec`; line `rgba(28, 21, 24, 0.1)`.
- Radius `0.75rem`, `1rem`, `1.5rem`, `2rem`; pill `999px`.
- Shadows: small `0 4px 16px rgba(28, 21, 24, 0.05)`, medium `0 14px 40px rgba(28, 21, 24, 0.08)`.

## Selector-specific UX direction

The print workspace should replace the current generic list with a product-aware selector. Keep the printer verification flow unchanged. After verification, make search the starting point, show each product as a recognizable row/card with product name and selected-count context, group variants beneath it with SKU, price, and copy stepper, and provide clear select-all/product-level selection states. Keep the print summary visible and sticky on larger screens while remaining comfortable on a mobile till. Long product names must wrap safely without hiding price, SKU, or copy controls.

## Fidelity constraint

Use ONLY the fonts, colors, spacing, and component styles defined here and in `src/app/globals.css`. Do not introduce any fonts, colors, or visual styles not in the design system.

