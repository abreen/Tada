# Theming

Sites are visually customized through a few config values:

- **themeColor**: a CSS color (any format: named, hex, HSL, RGB) used as the
  primary accent color. Light and dark mode variants are automatically derived.
- **tintHue** and **tintAmount**: control a subtle background color tint
  applied across the site (hue in degrees, amount as a percentage).
- **defaultContrast**: selects standard or high contrast before the page is
  rendered; visitors can override it with the appearance picker.
- **symbol**: short text displayed in the site logo area when `logo` is absent.
- **logo**: optional public-relative image replacing the header symbol; see [Header logo](logo.md).
- **favicon**: optional public-relative ICO replacing generated favicon assets and manifest; see [Favicons](favicons.md).

For example, `logo: branding/logo.svg` and `favicon: branding/favicon.ico` use
files in `public/branding/`. Both fields are independent; generated favicons use
`faviconSymbol` or `symbol`, even when a custom header logo is configured.

Theme values are compiled into CSS variables at build time and applied
site-wide. Text colors for both light and dark modes are derived automatically
to ensure readability against the chosen theme color.

## Link color

Links use a dedicated `--link-color` CSS variable that is derived from the
tint settings. The hue is anchored at GitHub-style blue (HSL 212) and pulled
5% of the way along the shortest hue arc toward `tintHue`, so the link color
reads as a clean blue that subtly leans into the site's tint. Saturation is
fixed independently of `tintAmount`: 44.4% in light mode and 50% in dark mode,
with hover values of 34% and 40%, respectively. Changing `tintAmount` affects
the neutral palette, not link saturation. The same color is used for the
external link SVG icon.

Visible link underlines use each font's underline thickness metadata via
`text-decoration-thickness: from-font`.

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
