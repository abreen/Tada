# Configuration

Tada reads one of two site config files depending on the build mode:

- `site.dev.*` for development builds
- `site.prod.*` for production builds

Supported extensions are `.yaml`, `.yml`, and `.json`. `tada init` generates
`site.dev.yaml` and `site.prod.yaml` by default.

## Supported config files

Tada supports these logical config inputs:

- `site.dev`
- `site.prod`
- `nav`
- `authors`

Each one is resolved by checking for exactly one matching file among the
supported extensions. For example, site development config can live in
`site.dev.yaml`, `site.dev.yml`, or `site.dev.json`.

Selection rules:

- `site.dev`, `site.prod`, and `nav` are required
- `authors` is optional
- if no required variant exists, the build fails
- if more than one variant exists for the same logical config name, the build
  fails

Tada never prefers YAML over JSON or vice versa when duplicates exist. Keeping
multiple variants such as `nav.yaml` and `nav.json` in the same site root is an
error because the source of truth would be ambiguous.

## Defaults

`tada init` generates YAML files by default:

- `site.dev.yaml`
- `site.prod.yaml`
- `nav.yaml`
- `authors.yaml` (when `--bare` is not specified)

## Required fields

- **base**: full URL without trailing slash (e.g., `https://example.edu`)
- **title**: site title, used in the page header and derived values
- **defaultTimeZone**: IANA time zone identifier (e.g., `America/New_York`)
- **themeColor**: CSS color for the site theme

## Optional fields

- **basePath**: URL prefix for all internal links (default: `/`)
- **symbol**: short text (1 to 5 chars) for the site logo and favicon
- **faviconSymbol**: overrides symbol for the favicon (defaults to symbol)
- **faviconColor**: overrides theme color for the favicon
- **faviconFontWeight**: font weight for the favicon symbol (1 to 1000)
- **titlePostfix**: appended to page titles in `<title>` (derived from title)
- **tintHue**: background tint hue, 0 to 360 degrees (default: 20)
- **tintAmount**: background tint intensity, 0 to 100% (default: 100)
- **internalDomains**: list of domains treated as internal for link styling
- **extensionToShikiLanguage**: optional map from source-file extensions to the
  Shiki language used for generated code pages
- **shikiLanguages**: optional list of bundled Shiki languages allowed in
  Markdown fences; plain-text fences (`text`, `txt`, `plain`) work without it
- **vars**: arbitrary key-value pairs accessible in templates as `vars.*`

## Feature flags

The `features` object toggles optional capabilities:

- **search**: enable Pagefind search indexing (default: true)
- **favicon**: generate favicon assets and web manifest (default: true)
- **footer**: show the Tada footer at the bottom of every page (default: true)
