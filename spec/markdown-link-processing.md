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

When the code feature is enabled, links to source files (e.g., `.java`, `.py`)
in the content directory are rewritten to point to the generated `.html` page.
This rewriting applies to both absolute and relative links. Files with code
extensions in `public/` are copied as-is and their links are not rewritten.


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
