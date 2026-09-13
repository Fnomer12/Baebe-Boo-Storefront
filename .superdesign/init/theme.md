# Baebe Boo design tokens

## Compact token summary

- Font: `var(--font-sans)`, falling back to `ui-sans-serif, system-ui, sans-serif`.
- Ink: `#1c1518`; soft ink: `#6b6167`; surface: `#ffffff`; cream canvas: `#fbf6f3`.
- Brand rose: `#cf7d95`; deep rose: `#b0617a`; brand tint: `#f7e7ec`; line: `rgba(28, 21, 24, 0.1)`.
- Radius: `0.75rem`, `1rem`, `1.5rem`, `2rem`, pill `999px`.
- Shadows: `0 4px 16px rgba(28, 21, 24, 0.05)`, `0 14px 40px rgba(28, 21, 24, 0.08)`, `0 26px 70px rgba(28, 21, 24, 0.1)`.
- Breakpoint: `xs: 420px`; Tailwind responsive breakpoints otherwise use defaults.
- Admin surfaces: white cards, rounded `1.5rem`/`2rem`, thin neutral borders, muted uppercase eyebrows, rose/ink controls, generous touch targets.

## Source tokens (`src/app/globals.css`)

```css
:root {
  --color-ink: #1c1518;
  --color-ink-soft: #6b6167;
  --color-surface: #ffffff;
  --color-cream: #fbf6f3;
  --color-brand: #cf7d95;
  --color-brand-deep: #b0617a;
  --color-brand-tint: #f7e7ec;
  --color-line: rgba(28, 21, 24, 0.1);
  --radius-sm: 0.75rem;
  --radius-md: 1rem;
  --radius-lg: 1.5rem;
  --radius-xl: 2rem;
  --radius-pill: 999px;
  --shadow-sm: 0 4px 16px rgba(28, 21, 24, 0.05);
  --shadow-md: 0 14px 40px rgba(28, 21, 24, 0.08);
  --shadow-lg: 0 26px 70px rgba(28, 21, 24, 0.1);
  --background: var(--color-cream);
  --foreground: var(--color-ink);
}
```

The complete styling source remains at `src/app/globals.css`; pass that file directly only when the design payload budget allows it.

