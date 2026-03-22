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
are rewritten to point to the generated `.html` page. This rewriting applies to
both absolute and relative links.


## External link marking

Links to domains not listed in `internalDomains` are automatically marked as
external. External links open in a new tab.


## Internal link validation

Internal links are checked against the set of known pages at build time. Broken
links produce a warning. The validator treats directory paths and their
corresponding `index.html` as equivalent.
