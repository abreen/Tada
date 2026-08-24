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

Generated development and production site configs explicitly include
`defaultFont: sans` and `defaultContrast: standard`.

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
- **banner**: Markdown rendered in a bordered box above every page; see
  [Site banner](banner.md)
- **tintHue**: background tint hue, 0 to 360 degrees (default: 20)
- **tintAmount**: background tint intensity, 0 to 100% (default: 100)
- **defaultFont**: initial typography, `sans` or `serif` (default: `sans`)
- **defaultContrast**: initial neutral-palette contrast, `standard` or `high`
  (default: `standard`)
- **fontOverrides**: optional licensed WOFF2 faces for the serif body and
  serif-monospace pair; see [Custom serif fonts](#custom-serif-fonts)
- **internalDomains**: list of domains treated as internal for link styling
- **extensionToShikiLanguage**: optional map from source-file extensions to the
  Shiki language used for generated code pages
- **shikiLanguages**: optional list of bundled Shiki languages allowed in
  Markdown fences; plain-text fences (`text`, `txt`, `plain`) work without it
- **vars**: arbitrary key-value pairs accessible in templates as `vars.*`

## Custom serif fonts

Site authors can replace either bundled serif family with WOFF2 files they own
under the site's `public/` directory:

```yaml
fontOverrides:
  serif:
    regular: fonts/body-regular.woff2
    italic: fonts/body-italic.woff2
    bold: fonts/body-bold.woff2
    boldItalic: fonts/body-bold-italic.woff2
    tuning:
      scale: 1.125
      lineHeight: 1.5
      headingScale: 0.9
      headingWeight: 400
      fontSizeAdjust: 0.67
  serifMono:
    regular: fonts/mono-regular.woff2
    italic: fonts/mono-italic.woff2
    bold: fonts/mono-bold.woff2
    boldItalic: fonts/mono-bold-italic.woff2
    features: [ss02]
    tuning:
      scale: 0.96
      lineHeight: 1.45
      fontSizeAdjust: 0.613
```

Each family is independent. When a family is present, `regular` is required;
the browser synthesizes any omitted italic or bold styles. Face paths use
POSIX separators and are relative to `public/`. Absolute paths, traversal,
query strings, fragments, and extensions other than `.woff2` are rejected.

`features` is an optional list of unique four-character OpenType tags. Tada
applies the list to that family and verifies that every configured face
supports every requested feature. It also verifies that each file exists, has
a WOFF2 signature, and can be parsed as a font. These validations run during
normal builds and watch updates; an invalid watch update leaves the last
successful output intact.

Custom fonts remain assets owned and licensed by the site author. They are
copied from `public/` using the normal public-asset pipeline and are never added
to the Tada package or starter site.

The optional `tuning` blocks account for the different optical size, vertical
metrics, and weight of a substituted family. `fontSizeAdjust` is a positive
number giving the custom faces' cap-height-to-font-size ratio. Tada emits it as
`font-size-adjust: cap-height <value>` so the custom face and its fallbacks keep
a more consistent apparent size while fonts load. Authors should derive it from
their font files; an inaccurate value also rescales the final custom face.
Serif `scale` changes the
serif-mode base font size relative to Tada's 1rem sans base, so content and
inheriting interface text such as metadata and navigation scale together,
while `lineHeight` controls content leading.
`headingScale` sizes authored headings and normal page titles independently of
`scale`, and `headingWeight` selects the configured regular (400) or bold (700)
face. In presentation mode, slide headings use the same scale proportionally
to the responsive slide size. Compact code-page file titles retain their
interface sizing. The
serif-mono `scale` is its size in em relative to the surrounding prose, and its
`lineHeight` controls code blocks. Both families accept `fontSizeAdjust`.
Scales accept 0.75 through 1.5, line heights accept 1 through 2.5, and font-size
adjustments must be greater than zero. Omitted values retain Tada's existing
styles, and an omitted `tuning` block emits no additional custom tuning CSS.

## Feature flags

The `features` object toggles optional capabilities:

- **search**: enable Pagefind search indexing (default: true)
- **favicon**: generate favicon assets and web manifest (default: true)
- **footer**: show the Tada footer at the bottom of every page (default: true)
