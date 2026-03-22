# Theming

Sites are visually customized through a few config values:

- **themeColor** -- a CSS color (any format: named, hex, HSL, RGB) used as the
  primary accent color. Light and dark mode variants are automatically derived.
- **tintHue** and **tintAmount** -- control a subtle background color tint
  applied across the site (hue in degrees, amount as a percentage).
- **symbol** -- short text displayed in the site logo area.

Theme values are compiled into CSS variables at build time and applied
site-wide. Text colors for both light and dark modes are derived automatically
to ensure readability against the chosen theme color.
