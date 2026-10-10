# Theming

Sites are visually customized through a few config values:

- **themeColor**: a CSS color (any format: named, hex, HSL, RGB) used as the
  primary accent color. Light and dark mode variants are automatically derived.
- **tintHue** and **tintAmount**: control the background and text color tint
  applied across the site (hue in degrees, amount as a percentage). The amount
  scales the saturation of the neutral palette linearly: 0 is fully gray, and
  100 gives a clearly visible tint.
- **defaultContrast**: selects standard or high contrast before the page is
  rendered; visitors can override it with the appearance picker.
- **symbol**: short text or a single emoji displayed in the site logo area when `logo` is absent.
- **logo**: optional public-relative image replacing the header symbol; see [Header logo](logo.md).
- **favicon**: optional public-relative ICO replacing generated favicon assets and manifest; see [Favicons](favicons.md).

For example, `logo: branding/logo.svg` and `favicon: branding/favicon.ico` use
files in `public/branding/`. Both fields are independent; generated favicons use
`faviconSymbol` or `symbol`, even when a custom header logo is configured.

Theme values are compiled into CSS variables at build time and applied
site-wide. Text colors for both light and dark modes are derived automatically
to ensure readability against the chosen theme color.

## Translucent background

The frosted site header and the navigation wash use a translucent primary
background at 66% opacity. In standard contrast it shares the primary
background's hue and saturation, so the header frosts the page without adding
color, while sitting slightly darker in light mode (95% vs. 97% lightness) and
slightly lighter in dark mode (10% vs. 5%) for a subtle tonal separation.

## Link color

Links use a dedicated `--link-color` CSS variable that is derived from the
tint settings. The hue, `--link-hue`, is anchored at blue (HSL 216) and leans
up to 9 degrees toward `tintHue`: the lean is `9deg * sin(tintHue - 216deg)`,
strongest when the tint is 90 degrees from the anchor
and zero at the anchor and its opposite. The link color reads as a clean blue
that subtly leans into the site's tint. The browser computes the lean from
`--tint-hue`, so changing `--tint-hue` at runtime also changes link colors, and
the color changes smoothly all the way around the hue wheel. Browsers without
CSS `sin()` use the fixed anchor hue. The active trace line background works
the same way, anchored at HSL 52 with up to 18 degrees of lean. Saturation and
lightness are fixed independently of `tintAmount`: 66% saturation and 38%
lightness in light mode, and 50% and 72% in dark mode. Hover colors are lighter
and less saturated: 56% and 49% in light mode, and 40% and 80% in dark mode.
The light mode link keeps at least 4.5:1 contrast against both the primary and
secondary backgrounds at any `tintHue` with full tint. Changing `tintAmount`
affects the neutral palette, not link color. The same color is used for the
external link SVG icon.

Visible link underlines use each font's underline thickness metadata via
`text-decoration-thickness: from-font`.

Inside `.alert.warning` and `.alert.note` boxes the link color is overridden
back to `--fg-color` (and the external link icon falls back to a foreground
variant), since the alert backgrounds are already saturated and a blue link
on top would be hard to read.

## Scrollbars

Scrollbars follow the tint through `scrollbar-color` on `:root`, which every
scrollable element inherits. The thumb, `--scrollbar-thumb-color`, uses the
tint hue at 25% of `tintAmount` saturation, with 72% lightness in light mode
and 28% in dark mode. The track, `--scrollbar-track-color`, is the primary
background. High contrast mode uses an achromatic gray thumb (55% lightness in
light mode, 45% in dark mode). The difference is most visible on platforms with
classic, always-visible scrollbars such as Windows; browsers without
`scrollbar-color` keep their native scrollbars.

## Contrast preference

The page-bottom [contrast picker](contrast-picker.md) offers an explicit high
contrast mode. It replaces the tint-sensitive neutral palette with achromatic
primary and secondary foregrounds, backgrounds, translucent colors, shadows,
and embedded neutral icons. Light mode uses black on white, and dark mode uses
white on black. Theme accents, links, warnings, and notes are not changed.
Sites can make this the build-time default with `defaultContrast: high` without
changing the palette or picker behavior.
