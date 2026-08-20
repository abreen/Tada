# Material Symbols

Tada vendors the small subset of Material Symbols used by generated sites.
Sites do not load the Material Symbols font or make requests to Google. During
theme compilation, Tada validates and URL-encodes each SVG as a CSS mask
variable, allowing the glyph to inherit `currentcolor` from its component.

`build/material-symbols.ts` is the single source of truth for the shared
Material Symbols Outlined configuration and the semantic icon registry. All
registered glyphs use FILL 0, weight 500, and grade 0. Each semantic entry also
declares an optical size of 20, 24, or 40, matching both its canonical SVG
variant and its rendered CSS dimensions.

The registry maps the Tada footer mark to the 24px `celebration`; standard and
high contrast to the 20px `contrast_rtl_off` and `contrast`; full and compact
informational alerts to the 40px and 20px `info` variants; full and compact
warnings to the 40px and 20px `warning` variants; parent links to 20px
`south_east`; search to 20px `search`; external links to 20px `open_in_new`;
slide-heading presentation controls to 24px `smart_display`; and the closed/open
header navigation states to the 24px `menu` and `close` variants.

Reusable inline symbols use the `.material-symbol-icon` mask class and set its
`--material-symbol-icon` and `--material-symbol-icon-size` variables through a
semantic modifier. Pseudo-element icons consume the registry's mask and size
variables directly through `contained-mask`. This keeps the displayed pixel
size synchronized with the glyph's optical-size axis.

Canonical SVGs live in `assets/material-symbols/`. Theme generation fails with
an icon-specific diagnostic if a registered file is missing or its width,
height, or viewBox does not match that entry's configured optical size. The
renderer accepts an alternate package root and file reader so these checks can
be tested without filesystem access.

To add a Material Symbol:

1. Choose a rendered size supported by the registry, then download the outlined,
   FILL 0, weight 500, grade 0 SVG with that same optical size from Google Fonts
   Icons.
2. Add the unmodified file to `assets/material-symbols/` using its canonical
   `<symbol>_<size>px.svg` filename.
3. Add one semantic entry to `MATERIAL_SYMBOLS` with the CSS variable name,
   canonical symbol name, and optical size.
4. Consume both generated variables as a mask and fixed size through a semantic
   component class or pseudo-element. Do not add the glyph to Tada's separate
   bespoke icon definitions or scale the SVG to a different size.

Update `NOTICES.md` whenever the vendored glyph set changes.
