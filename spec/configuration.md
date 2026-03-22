# Configuration

Tada reads one of two JSON config files depending on the build mode:

- `site.dev.json` for development builds
- `site.prod.json` for production builds

## Required fields

- **base** -- full URL without trailing slash (e.g., `https://example.edu`)
- **title** -- site title, used in the page header and derived values
- **defaultTimeZone** -- IANA time zone identifier (e.g., `America/New_York`)
- **themeColor** -- CSS color for the site theme

## Optional fields

- **basePath** -- URL prefix for all internal links (default: `/`)
- **symbol** -- short text (1--5 chars) for the site logo and favicon
- **faviconSymbol** -- overrides symbol for the favicon (defaults to symbol)
- **faviconColor** -- overrides theme color for the favicon
- **faviconFontWeight** -- font weight for the favicon symbol (1--1000)
- **titlePostfix** -- appended to page titles in `<title>` (derived from title)
- **tintHue** -- background tint hue, 0--360 degrees (default: 20)
- **tintAmount** -- background tint intensity, 0--100% (default: 100)
- **internalDomains** -- list of domains treated as internal for link styling
- **codeLanguages** -- maps file extensions to language names (default: Java, Python)
- **vars** -- arbitrary key-value pairs accessible in templates

## Feature flags

The `features` object toggles optional capabilities:

- **search** -- enable Pagefind search indexing (default: true)
- **code** -- enable source code page generation (default: true)
- **favicon** -- generate favicon assets and web manifest (default: false)
