# Contrast Picker

Every page includes a contrast picker beside the font picker in the appearance
control row after the optional Tada attribution footer. Standard contrast is
the default when `defaultContrast` is omitted from site config. Authors can set
`defaultContrast: high` to build every page with high contrast already active.
High contrast uses an achromatic neutral palette while leaving theme accents,
links, warnings, and notes unchanged.

In light mode, high contrast uses black primary text on a white page. Secondary
foreground is 30% lightness and the secondary background is `#f4f4f4`. In dark
mode these become white primary text on a black page, with secondary foreground
and background lightness values of 70% and 15%. Saturation is zero throughout
the high-contrast neutral palette, so `tintHue` and `tintAmount` do not
color-shift it. Neutral translucent colors retain their standard alpha values,
and neutral shadows and embedded search and chevron icons are also achromatic.
In high contrast, the fixed site header uses the solid primary background at
rest and the solid secondary background while hovered or while its navigation
details are open. Standard contrast retains the translucent header background.

The buttons expose their state with `aria-pressed`. The root `<html>` records
the configured choice in `data-default-contrast-preference`; effective high
contrast uses `data-contrast-preference="high"`. When the configured default is
standard and there is no valid visitor selection, `prefers-contrast: more`
becomes the effective default. This system-derived choice is not stored. A
visitor selection that differs from the effective default is stored as
`contrastPreference=standard` or `contrastPreference=high`; choosing the
effective default removes the key. This lets an explicit standard selection
override a system preference for more contrast. A guarded inline script
applies the stored or system-derived preference before paint.

The standard button uses the Material Symbols Outlined `contrast_rtl_off`
glyph and the high button uses `contrast`. Both are vendored SVG masks rendered
in the button's current text color. Their shared icon configuration and build
pipeline are described in [Material Symbols](material-symbols.md).

The contrast and font pickers mount and synchronize together after initial
load and client-side navigation. Their preferences remain independent. The row
is rendered at build time in its final layout position with all four buttons
disabled; mounting enables and synchronizes them. With JavaScript disabled it
remains visible but inert and the complete page uses the configured contrast.
The row is excluded from Pagefind indexing and printing.
