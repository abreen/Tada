# Breadcrumbs

A page can display a single breadcrumb link above its title by setting `parent`
(the target URL) and `parentLabel` (the link text) in its front matter.

Root-relative `parent` URLs are prefixed with `basePath` in the final HTML.
Relative `parent` URLs remain relative to the page that declares them.
Authored `parent` URLs are encoded when rendered so spaces and
HTML-significant characters do not appear raw in `href` attributes, while
existing percent escapes remain intact.

This provides a simple one-level "back to" navigation, not a full breadcrumb
trail.

The `parent` URL is validated against the set of known pages at build time. A
broken parent link fails the build.
