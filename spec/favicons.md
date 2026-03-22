# Favicons

When the favicon feature is enabled, Tada generates a full set of favicon assets
from the site's configured symbol text and color.

The symbol (1--5 characters) is rendered at multiple sizes as PNG and ICO files,
plus an SVG version. An Apple Touch Icon is also generated. Light and dark mode
variants use colors derived from the theme color.

A web app manifest (`manifest.json`) is generated alongside the favicons,
referencing all icon sizes and the site title.

Favicon generation uses TTF fonts bundled with the package.
