# Material Symbols

Tada vendors the small subset of Material Symbols used by generated sites.
Sites do not load the Material Symbols font or make requests to Google. During
theme compilation, Tada validates and URL-encodes each SVG as a CSS mask
variable, allowing the glyph to inherit `currentcolor` from its component.

`build/material-symbols.ts` is the single source of truth for the shared
Material Symbols Outlined configuration and the semantic icon registry. All
registered glyphs use FILL 0, weight 400, grade 0, and optical size 24. The
registry currently maps the Tada footer mark to `celebration`, standard
contrast to `contrast_rtl_off`, high contrast to `contrast`, informational
alerts to `info`, warnings to `warning`, parent links to `south_east`, search
to `search`, external links to `north_east`, heading anchors to `tag`, and the
closed/open header navigation states to `menu` and `close`.

Reusable inline symbols use the `.material-symbol-icon` mask class and set its
`--material-symbol-icon` variable through a semantic modifier. Pseudo-element
icons consume the same registry variables directly through `contained-mask`.

Canonical SVGs live in `assets/material-symbols/`. Theme generation fails with
an icon-specific diagnostic if a registered file is missing or its width,
height, or viewBox does not match the shared 24px configuration. The renderer
accepts an alternate package root and file reader so these checks can be tested
without filesystem access.

To add a Material Symbol:

1. Download the outlined, FILL 0, weight 400, grade 0, optical size 24 SVG from
   Google's Material Design Icons repository.
2. Add the unmodified file to `assets/material-symbols/` using its canonical
   `<symbol>_24px.svg` filename.
3. Add one semantic entry to `MATERIAL_SYMBOLS` with the CSS variable name and
   canonical symbol name.
4. Consume that variable as a mask through a semantic component class or
   pseudo-element. Do not add the glyph to Tada's separate bespoke icon
   definitions.

Update `NOTICES.md` whenever the vendored glyph set changes.
