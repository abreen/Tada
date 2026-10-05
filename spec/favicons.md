# Favicons

When the favicon feature is enabled, Tada generates a full set of favicon assets
from the site's configured symbol text and color.

The symbol (1 to 5 characters) is rendered at multiple sizes as PNG and ICO files,
plus an SVG version. An Apple Touch Icon is also generated. The favicon uses the
light mode theme color and its derived text color. The home-screen app name
(`apple-mobile-web-app-title`) is the site title.

Favicons are drawn from text glyphs and cannot render emoji. `faviconSymbol`
defaults to a text `symbol`; with an emoji `symbol`, generated favicons require
an explicit text `faviconSymbol` (see [Header logo](logo.md)).

A web app manifest (`manifest.json`) is generated alongside the favicons,
referencing all icon sizes and the site title.

Favicon generation uses TTF fonts bundled with the package.

## Custom favicon

Set top-level `favicon: branding/favicon.ico` to use an existing ICO file from
`public/`. It follows the public-relative path rules described in [Header
logo](logo.md) and must end in `.ico`. Tada checks existence and readability,
without decoding or converting the file, and copies its bytes unchanged.

When enabled, a custom favicon emits one ICO link. It replaces all generated
SVG, PNG, ICO, Apple Touch Icon links, the web app manifest, and related web app
metadata. `faviconSymbol`, `symbol`, color, and font weight affect only generated
favicons; custom logo/favicon builds can omit `symbol`.

`features.favicon: false` omits every favicon link and all generation, including
custom links. Configured assets are still validated and public files still copy.
This behavior applies to development, production, and watch builds. Switching
between generated and custom configurations in watch mode uses a full rebuild
and removes obsolete generated outputs.
