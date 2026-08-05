---
version: 1
name: Subtle-Gradient-Design-System
description: |
  Photography-first editorial system for NewzWale. A soft coral accent over warm
  neutral surfaces, subtle gradients that stay out of the imagery's way, rounded
  geometry, and an 8-point spacing scale.
---

# NewzWale Design System

Source of truth: `src/styles/global.css`. This document explains the system; the CSS
implements it. If they disagree, the CSS wins - and this file should be corrected.

## How it works

Tokens are declared in a Tailwind v4 `@theme` block (**not** `@theme inline`), so every
utility compiles to a `var()` reference:

```css
.bg-canvas { background-color: var(--color-canvas) }
.text-ink  { color: var(--color-ink) }
```

An `html.dark { ... }` block re-points the same variables. **This is the most important
thing to understand about this codebase:**

> Because the variables themselves change in dark mode, you almost never need a `dark:`
> variant. Write `bg-surface-soft`, not `bg-[#faf9f7] dark:bg-[#050505]`.

The migration from hardcoded hex to tokens deleted 302 of 307 `dark:` variants. The five
survivors sit on bands that stay dark in *both* modes (the breaking-news ticker and the
`/verify` hero), where no single token is light in both.

Only reach for `dark:` when dark mode needs something genuinely different beyond the token
swap - an opacity or shadow change, or a display toggle like the sun/moon icons.

## Colour

### Accessibility contract - read before using coral

`primary` (`#ff6b57`) is **decorative only**. It is 2.8:1 against white and fails WCAG AA.
Use it for fills, dots, rules, and large shapes. **Never put text on it. Never use it as
text on a light surface.**

`primary-strong` (`#cc4430`, 4.73:1 on white) is the text-safe coral: links, button
labels, coloured headings. In dark mode both resolve to `#ff8b7a`.

`tests/contrast.test.ts` asserts every text/surface pair in both modes against the WCAG
formula in `src/lib/contrast.ts`, including a test that pins the raw coral as unsafe so it
does not get "simplified" back later. If you change a colour, run `npm test`.

### Tokens

| Token | Light | Dark | Use |
|---|---|---|---|
| `primary` | `#ff6b57` | `#ff8b7a` | Decorative fills only |
| `primary-strong` | `#cc4430` | `#ff8b7a` | Links, button labels, coloured text |
| `primary-pressed` | `#e45444` | `#ff6b57` | Hover/active on coral |
| `on-primary` | `#ffffff` | `#1a1a18` | Text on a coral fill |
| `ink` | `#111111` | `#f5f4f1` | Primary text |
| `ink-soft` | `#262626` | `#e5e4df` | Secondary headings |
| `body` | `#3a3a35` | `#c9c8c2` | Body copy |
| `charcoal` | `#2d2d29` | `#d3d3cd` | Emphasis text |
| `mute` | `#686860` | `#9a9a94` | Muted copy, captions |
| `ash` | `#9a9a94` | `#686860` | Dimmest copy |
| `stone` | `#cdcdc7` | `#3a3a35` | Dividers on dark bands |
| `hairline` | `#ddddda` | `#3a3a35` | Borders |
| `hairline-soft` | `#ecece8` | `#2d2d29` | Subtle borders |
| `secondary-bg` | `#ecece8` | `#2d2d29` | Secondary buttons |
| `canvas` | `#ffffff` | `#1a1a18` | Page base |
| `surface-soft` | `#faf9f7` | `#232320` | Default page background |
| `surface-card` | `#f4f3ef` | `#2d2d29` | Inset panels |
| `surface-elevated` | `#ffffff` | `#2d2d29` | **Cards** |
| `gradient-start` | `#fff6f2` | `#241d1b` | Gradient stop |
| `gradient-end` | `#f7efe8` | `#1f1c19` | Gradient stop |
| `success` / `error` / `warning` | `#2f7d4f` / `#c0392b` / `#a86a1c` | `#6ec48f` / `#f08a7d` / `#e0b070` | Status |

### The surface ladder

Cards use `surface-elevated`, **not** `canvas`. In dark mode `canvas` is the *darkest*
token, so a card on `bg-canvas` renders recessed against the page. `surface-elevated` sits
above the page background in both modes.

Page -> `surface-soft`. Card -> `surface-elevated`. Inset panel inside a card -> `surface-card`.

Footers are the deliberate exception: they use `canvas` so they read darker than the page
in dark mode.

## Typography

Inter throughout. JetBrains Mono is retained for datelines, tickers, and source labels -
news metadata benefits from tabular, non-prose type. Apply via `.font-mono-caption`.

| Utility | Size | Weight | Tracking |
|---|---|---|---|
| `text-display-xl` | 70px / 1.1 | 600 | -1.2px |
| `text-display-lg` | 44px / 1.15 | 700 | -0.8px |
| `text-body-md` | 16px / 1.4 | 400 | - |

## Geometry

`rounded-sm` 8px, `rounded-md` 16px, `rounded-lg` 32px, `rounded-full` pill.

Cards, buttons, and inputs are 16px. Large containers and hero panels are 32px. Chips,
tabs, tags, and search fields are pills.

Note that `@theme` **overrides** Tailwind's default radius scale. `rounded-lg` here is
32px, not the stock 8px. Check computed styles when porting markup from elsewhere.

## Spacing

Use Tailwind's **stock numeric scale**. It already lands on the system's 8-point values:

| System | px | Utility |
|---|---|---|
| xxs | 4 | `p-1` |
| xs | 6 | `p-1.5` |
| sm | 8 | `p-2` |
| md | 12 | `p-3` |
| lg | 16 | `p-4` |
| xl | 24 | `p-6` |
| xxl | 32 | `p-8` |
| section | 64 | `p-16` |

**Do not add named `--spacing-*` tokens to `@theme`.** Tailwind v4 resolves
`max-w-*`, `w-*` and `h-*` through the spacing scale, so defining `--spacing-xl`
silently redefines `max-w-xl` from 36rem to 24px. That shipped once and collapsed a
paragraph on /verify into a one-word-per-line column.

## Components

Defined in `global.css`:

`.btn-primary`, `.btn-secondary`, `.btn-pill-primary`, `.btn-pill-secondary`,
`.search-pill`, `.content-card`, `.font-mono-caption`, `.mesh-gradient-bg`,
`.mesh-gradient-glow`, `.shadow-stacked-sm|md|lg`, `.animate-marquee`

**Cascade warning:** these are unlayered CSS, so they beat Tailwind utilities on the same
element. `.btn-primary` will silently override a `font-bold` or `bg-*` utility you put
beside it. For custom buttons, compose tokens directly
(`bg-primary-strong hover:bg-primary-pressed text-on-primary`) instead.

## Motion and focus

Every interactive element gets a visible `:focus-visible` ring in `primary-strong`.

A `prefers-reduced-motion` block disables the marquee and collapses transitions. Respect it -
do not add unconditional animation.

## Conventions

- No hardcoded hex in components. `src/**/*.astro` contains zero. Keep it that way.
- No new colours without a corresponding assertion in `tests/contrast.test.ts`.
- Re-skins should not change layout, copy, or behaviour.
