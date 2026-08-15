# Contrast Picker

Every page includes a contrast picker beside the font picker in the appearance
control row after the optional Tada attribution footer. Standard contrast is
the default. High contrast uses an achromatic neutral palette while leaving
theme accents, links, warnings, and notes unchanged.

In light mode, high contrast uses black primary text on a white page. Secondary
foreground is 30% lightness and the secondary background is `#f4f4f4`. In dark
mode these become white primary text on a black page, with secondary foreground
and background lightness values of 70% and 15%. Saturation is zero throughout
the high-contrast neutral palette, so `tintHue` and `tintAmount` do not
color-shift it. Neutral translucent colors retain their standard alpha values,
and neutral shadows and embedded search and chevron icons are also achromatic.

The buttons expose their state with `aria-pressed`. Selecting high contrast
sets `data-contrast-preference="high"` on the root `<html>` element and stores
`contrastPreference=high` in local storage. Selecting standard contrast removes
both the attribute and stored value. An inline script restores high contrast in
the document head so it applies before the page is painted. The preference is
explicit and does not follow `prefers-contrast`.

The standard button uses the Material Symbols Outlined `contrast_rtl_off`
glyph and the high button uses `contrast`. Both are vendored SVG masks rendered
in the button's current text color. Their shared icon configuration and build
pipeline are described in [Material Symbols](material-symbols.md).

The contrast and font pickers mount and synchronize together after initial
load and client-side navigation. Their preferences remain independent. The row
is rendered at build time in its final layout position with all four buttons
disabled; mounting enables and synchronizes them. With JavaScript disabled it
remains visible but inert and the complete page uses standard contrast. The row
is excluded from Pagefind indexing and printing.
