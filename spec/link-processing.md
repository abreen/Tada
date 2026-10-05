# Link Processing

Link processing in Tada is split between Markdown rendering and a final HTML
pass over each generated page.

The final pass (`build/utils/final-html.ts`) streams each page through Bun's
`HTMLRewriter`. It edits only the `href`, `src`, and `data-tada-page` attributes
it rewrites and leaves the rest of the markup, including the doctype, exactly as
rendered. Character references in attribute values (such as `&amp;`) are
decoded before links are resolved and re-encoded when an attribute is
rewritten. Links inside `<noscript>` and `<template>` are processed like any other
links, so they also get the base path and link validation.


## Base path rewriting

The `basePath` config field (default: `/`) sets a URL prefix for the site. This
is useful when a site is hosted at a subpath of a domain (e.g., `/course` or
`/old/26summer` instead of the root). Each slash-separated segment may contain
letters, digits, and hyphens; non-root base paths must not end with a slash.

### Absolute links

Absolute internal `href` and `src` attributes (starting with `/`) in generated
pages are prefixed with the base path. This includes:

- links and images rendered from Markdown
- raw HTML written inside Markdown files
- `.html` content pages
- markup contributed by Markdown partials

### Relative links

Relative links are not prefixed with the base path.
They resolve from the generated page's encoded URL path, so a directory whose
literal name contains a percent escape (for example, `100%20done`) remains
distinct from one containing a space. The on-disk output names remain literal.

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
feature. The final word and external-link icon stay together when wrapping,
and the icon also stays with any immediately following non-whitespace content,
such as sentence punctuation.


## Internal link validation

Rendered internal links are checked against the set of known output paths at
build time. This includes generated pages, assets in `content/`, and files in
`public/`. Broken links cause the build to fail. Only rendered `href`
attributes participate in this validation.

This validation covers:

- Links in rendered page content from Markdown and `.html` sources
- `internal` links in the nav config (these paths must be root-relative)
- `avatar` paths in the authors config (these paths must be root-relative)
- Root-relative `url` values in the authors config; absolute author URLs are
  allowed and are not checked against build targets
- Every `url` in the front matter `breadcrumbs` list (internal links only;
  relative paths resolve from the declaring page)

Hrefs are percent-decoded before being matched against the set of known output
paths, which means a link to a file with a space in its name works when written
as either `[x](</my notes.md>)` (angle-bracket form) or `[x](/my%20notes.md)`
(percent-encoded form). The bare form `[x](/my notes.md)` is rejected by
markdown-it's own parser before reaching the validator, per the CommonMark
link-destination grammar.

## Generated-page navigation markers

After link rewriting, the final HTML pass recomputes the reserved boolean
`data-tada-page` attribute on anchors throughout the document, including raw
HTML, partials, banners, navigation, breadcrumbs, and author links. Only routes
produced by Tada page renderers (including index aliases) receive this marker.
Copied public HTML, raw source downloads, other assets, and anchors with `target`
or `download` remain unmarked. Author-supplied markers are removed and recomputed.

Classification preserves the final `href`, resolves relative URLs against the
page output URL (escaping filesystem `#` and `?` characters while preserving
already encoded code-page paths), decodes paths, ignores queries and fragments, and handles the
configured base path and absolute URLs on the configured site origin. Watch mode
tracks classification dependencies for marked and unmarked internal links and
rebuilds dependent pages when route ownership changes, even if the pathname
remains valid. Ordinary hrefs continue to work with JavaScript disabled.
