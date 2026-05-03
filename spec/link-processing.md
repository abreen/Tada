# Link Processing

Link processing in Tada is split between Markdown rendering and a final HTML
pass over each generated page.


## Base path rewriting

The `basePath` config field (default: `/`) sets a URL prefix for the site. This
is useful when a site is hosted at a subpath of a domain (e.g., `/course/`
instead of the root).

### Absolute links

Absolute internal `href` and `src` attributes (starting with `/`) in generated
pages are prefixed with the base path. This includes:

- links and images rendered from Markdown
- raw HTML written inside Markdown files
- `.html` content pages
- markup contributed by Markdown partials

### Relative links

Relative links are not prefixed with the base path.

### Links to code

When an extension is present in `extensionToShikiLanguage`, links in rendered
page content to matching source files (for example, `.java`, `.py`) are
rewritten to point to the generated `.html` page when one exists. This applies
to both absolute and relative links in Markdown output and HTML page content.
Files with code extensions in `public/` are copied as-is and their links are
not rewritten. Anchors with a `download` attribute keep the raw file target.


## External link marking

Links to domains not listed in `internalDomains` are automatically marked as
external during Markdown rendering. External links open in a new tab with
`rel="noopener noreferrer"`. Raw HTML content is not decorated with this
feature.


## Internal link validation

Rendered internal links are checked against the set of known output paths at
build time. This includes generated pages, assets in `content/`, and files in
`public/`. Broken links cause the build to fail. Only rendered `href`
attributes participate in this validation.

This validation covers:

- Links in rendered page content from Markdown and `.html` sources
- `internal` links in the nav config (these paths must be root-relative)
- `url` and `avatar` paths in the authors config (these paths must be
  root-relative)
- `parent` breadcrumb links in front matter

Hrefs are percent-decoded before being matched against the set of known output
paths, which means a link to a file with a space in its name works when written
as either `[x](</my notes.md>)` (angle-bracket form) or `[x](/my%20notes.md)`
(percent-encoded form). The bare form `[x](/my notes.md)` is rejected by
markdown-it's own parser before reaching the validator, per the CommonMark
link-destination grammar.
