# Partials

Content files whose basename starts with an underscore (`_`) are partials:
reusable Markdown fragments that can be included into Markdown pages but are
never rendered as standalone HTML pages.

## Including a partial

Use a standalone Markdown block whose trimmed contents are three opening braces,
a partial path, and three closing braces:

```md
{{{ _problem1.md }}}
```

The path is resolved relative to the Markdown file that contains the directive.
Subdirectory paths work:

```md
{{{ subdir/_problem2.md }}}
```

The directive is block-only. Inline text such as
`before {{{ _problem1.md }}} after` is ordinary Markdown text, not a partial
include.

To write a literal `{{{`, escape the first brace:

```md
\{{{ _problem1.md }}}
```

Triple braces inside inline code spans or fenced/indented code blocks are
ordinary code and are not treated as partial directives.

## Nesting

Markdown partials can include other Markdown partials. Each nested include
resolves relative to the partial that contains it, not the original page. For
example, if `subdir/_outer.md` contains `{{{ _inner.md }}}`, the path
`_inner.md` is resolved inside `subdir/`.

A maximum nesting depth of 10 is enforced to prevent infinite recursion.

## Markdown rendering

Partials must be Markdown files (`.md` or `.markdown`) and must have a basename
that starts with `_`. The partial is Lodash-processed with the including page's
template context, then parsed as Markdown at the directive's block position.
This means headings, links, lists, blockquotes, and other Markdown syntax in the
partial render in the context where the directive appears.

Partials do not have their own front matter.

## Template context

Partials receive the same template parameters as the including page. This
includes `page`, `site`, and other page-level helpers such as trace rendering.
The partial path itself is read after Lodash preprocessing of the file that
contains the directive, so template expressions can generate a directive path.

## Unsupported includes

HTML partial includes are not supported. An include that targets
`_partial.html` or another non-Markdown file produces a build error.

Partial includes are only processed while rendering Markdown pages and other
Markdown partials. HTML content pages are not passed through the Markdown
partial pipeline.

## Build behavior

- Partials are excluded from the build output. No HTML page is generated for a
  partial, and partials do not appear as valid internal link targets.
- In watch mode, editing, adding, or deleting a partial rebuilds only the pages
  that depend on that partial, including transitive include chains
  (see [Watch Mode](watch-mode.md)).

## Naming convention

Only Markdown files whose basename starts with `_` can be included as partials.
Attempting to include a file without the underscore prefix produces a build
error.
