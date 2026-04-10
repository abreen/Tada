# Theming

Sites are visually customized through a few config values:

- **themeColor**: a CSS color (any format: named, hex, HSL, RGB) used as the
  primary accent color. Light and dark mode variants are automatically derived.
- **tintHue** and **tintAmount**: control a subtle background color tint
  applied across the site (hue in degrees, amount as a percentage).
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
