# Theming

Sites are visually customized through a few config values:

- **themeColor**: a CSS color (any format: named, hex, HSL, RGB) used as the
  primary accent color. Light and dark mode variants are automatically derived.
- **tintHue** and **tintAmount**: control a subtle background color tint
  applied across the site (hue in degrees, amount as a percentage).
- **defaultContrast**: selects standard or high contrast before the page is
  rendered; visitors can override it with the appearance picker.
- **symbol**: short text displayed in the site logo area.

Theme values are compiled into CSS variables at build time and applied
site-wide. Text colors for both light and dark modes are derived automatically
to ensure readability against the chosen theme color.

## Link color

Links use a dedicated `--link-color` CSS variable that is derived from the
tint settings. The hue is anchored at GitHub-style blue (HSL 212) and pulled
5% of the way along the shortest hue arc toward `tintHue`, so the link color
reads as a clean blue that subtly leans into the site's tint. Saturation
scales with `tintAmount` over a base floor, so links remain recognizably
blue even when `tintAmount` is 0. The same color is used for the external
link SVG icon.

Inside `.alert.warning` and `.alert.note` boxes the link color is overridden
back to `--fg-color` (and the external link icon falls back to a foreground
variant), since the alert backgrounds are already saturated and a blue link
on top would be hard to read.

## Contrast preference

The page-bottom [contrast picker](contrast-picker.md) offers an explicit high
contrast mode. It replaces the tint-sensitive neutral palette with achromatic
primary and secondary foregrounds, backgrounds, translucent colors, shadows,
and embedded neutral icons. Light mode uses black on white, and dark mode uses
white on black. Theme accents, links, warnings, and notes are not changed.
Sites can make this the build-time default with `defaultContrast: high` without
changing the palette or picker behavior.
