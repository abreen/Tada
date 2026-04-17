# Partials

Content files whose basename starts with an underscore (`_`) are partials:
reusable fragments that can be included into pages but are never rendered as
standalone HTML pages.

## Including a partial

Use the `include()` template function in a page or another partial:

```
<%= include('_problem1.md') %>
```

The argument is a path resolved relative to the file that calls `include()`.
Subdirectory paths work:

```
<%= include('subdir/_problem2.md') %>
```

## Nesting

Partials can include other partials. Each nested `include()` resolves relative
to the partial that calls it, not the original page. For example, if
`subdir/_outer.md` contains `<%= include('_inner.md') %>`, the path `_inner.md`
is resolved inside `subdir/`.

A maximum nesting depth of 10 is enforced to prevent infinite recursion.

## Markdown partials

Partials with an `.md` extension are Lodash-processed and then spliced into the
calling page as raw Markdown, before the Markdown renderer runs. This means
headings, links, and other Markdown syntax in the partial are rendered in the
context of the parent page.

## HTML partials

Partials with an `.html` extension are Lodash-processed only. The resulting HTML
is inserted into the calling page as-is. Because the Markdown renderer is
configured to pass through raw HTML, the content appears unchanged in the final
output.

## Template context

Partials receive the same template parameters as the including page. This
includes `page`, `site`, `applyBasePath`, and any other functions or variables
available to the page. Partials do not have their own front matter.

## Build behavior

- Partials are excluded from the build output. No HTML page is generated for
  a partial, and partials do not appear as valid internal link targets.
- In watch mode, editing, adding, or deleting a partial rebuilds only the pages
  that depend on that partial, including transitive include chains
  (see [Watch Mode](watch-mode.md)).

## Naming convention

Only files whose basename starts with `_` can be passed to `include()`.
Attempting to include a file without the underscore prefix produces a build
error.
