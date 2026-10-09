# PLAN: `--danger-text-color` for nested `<strong>` and `<em>` elements

## Current state (reading `templates/_theme.scss`)

Link text color is computed via:

- **`lean-toward-tint()` function** (line 12): `calc($anchor + $max * sin(var(--tint-hue) - $anchor))`
- **Anchor hue**: 216deg (blue), with max lean of 9deg toward the site's `--tint-hue`
- **Light mode**: `hsl(var(--link-hue) 66% 38%)`
- **Dark mode**: `hsl(var(--link-hue) 50% 72%)`
- The lean uses CSS `sin()` when supported, falling back to the fixed anchor

`<strong>` and `<em>` elements currently have **no custom CSS styling** anywhere in `src/`.

## Proposed changes

### 1. `templates/_theme.scss` — Add danger color variables analogous to link colors

- Define `--danger-hue` anchored at ~15deg (a warm red, slightly off pure 0 to avoid purple overlap and match the warmth pattern)
- Same `lean-toward-tint()` formula: `lean-toward-tint(15deg, 9deg)` — same max lean (9deg) for consistency with link behavior
- Light mode: `hsl(var(--danger-hue) 60% 40%)` (red with slight tint lean, 7:1+ contrast on white)
- Dark mode: `hsl(var(--danger-hue) 55% 68%)` (red tint for dark backgrounds, ~4.5:1 contrast)
- Dark mode hover variants: slightly lighter

### 2. `src/_content.scss` — Add nested `<strong>`/`<em>` styling

- `.content strong em, .content em strong` (nested combinations)
- `.content em strong` and `.content strong em` as the two nesting cases
- Apply `color: var(--danger-text-color)` for the nested elements

### 3. `spec/theming.md` — Document the new danger color in the Link Color section

### 4. `playwright/danger-color.spec.ts` — Browser tests mirroring the existing link-color tests

- Runtime hue change test (120 vs 300 produce different colors)
- Gradual hue wheel test (10-degree steps, <8 channel difference)

## Questions for you

1. **Anchor hue for red**: Proposed 15deg (warm red, like "tomato" rather than pure fire-engine 0deg). Pure 0deg can shift toward magenta with the sin lean — 15deg is safer.

2. **Scope**: Should `--danger-text-color` apply only to nested `<strong>`/`<em>` within `.content` (prose), or also to nav, TOC, and other navigation areas?

3. **Hover state**: Should nested `<strong>`/`<em>` have a hover color variant (like links do)?
