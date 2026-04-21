# Markdown Link Processing

Three kinds of link processing are applied to Markdown content.


## Base path rewriting

The `basePath` config field (default: `/`) sets a URL prefix for the site. This
is useful when a site is hosted at a subpath of a domain (e.g., `/course/`
instead of the root).

### Absolute links

Absolute internal links (starting with `/`) in Markdown content are prefixed
with the base path. This applies to:

- Markdown links and image URLs
- Raw HTML `<a href>` and `<img src>` attributes within Markdown files

### Relative links

Relative links are not prefixed with the base path.

### Links to code

When an extension is present in `extensionToShikiLanguage`, links to matching
source files (e.g., `.java`, `.py`) in the content directory are rewritten to
point to the generated `.html` page. This rewriting applies to both absolute
and relative links, including raw HTML `<a href>` attributes within Markdown.
Files with code extensions in `public/` are copied as-is and their links are
not rewritten.


## External link marking

Links to domains not listed in `internalDomains` are automatically marked as
external. External links open in a new tab.


## Internal link validation

Internal links are checked against the set of known output paths at build time.
This includes generated pages, assets in `content/`, and files in `public/`.
Broken links cause the build to fail.

This validation covers:

- Links in Markdown content (both Markdown syntax and raw HTML)
- `internal` links in `nav.json` (but disabled links are skipped)
- `url` and `avatar` paths in `authors.json`
- `parent` breadcrumb links in front matter

Hrefs are percent-decoded before being matched against the set of known output
paths, which means a link to a file with a space in its name works when written
as either `[x](</my notes.md>)` (angle-bracket form) or `[x](/my%20notes.md)`
(percent-encoded form). The bare form `[x](/my notes.md)` is rejected by
markdown-it's own parser before reaching the validator, per the CommonMark
link-destination grammar.
