# Breadcrumbs

A page can display an explicitly authored trail of ancestor links above its
existing heading using a YAML `breadcrumbs` list in front matter:

```yaml
title: Counting vowels
breadcrumbs:
  - label: Labs
    url: /labs/index.html
  - label: Lab 0
    url: /labs/00/index.html
```

This renders **Labs › Lab 0 › Counting vowels**. The list contains ancestors
only, in the authored order; Tada does not infer ancestors from directories or
other pages. The current item uses the plain-text `title`, while the existing
heading retains its inline Markdown formatting. Missing or empty lists render
no breadcrumb navigation.

Each entry requires a nonempty string `label` and `url`. Labels and URLs are
Lodash-processed with the existing front matter template context before
validation. Labels render as escaped plain text, without Markdown formatting.
Malformed lists or entries fail the build with a file-specific diagnostic that
identifies the entry (numbered from 1) when applicable. `parent` and
`parentLabel` are reserved front matter keys and fail the build.

Breadcrumb URLs must be internal site links with a pathname. Root-relative URLs
are prefixed with `basePath` in the final HTML. Relative URLs remain relative to
the page that declares them. Query strings and fragments are retained but
ignored when resolving build targets. Authored URLs are encoded when rendered
so spaces and HTML-significant characters do not appear raw in `href`
attributes, while existing percent escapes remain intact.

Every URL is validated against known output paths at build time; a broken link
fails the build and identifies its entry. Directory-only links, including `/`,
must reference `index.html` explicitly (for example, `/docs/index.html` instead
of `/docs/`). If the corresponding index page exists, the build reports its
expected path in the error. All resolved targets are tracked as watch-mode
dependencies. These rules apply to Markdown, HTML, and literate Java pages,
including when Java execution is skipped because `javac` is unavailable.

The build renders a `<nav aria-label="Breadcrumb">` containing an ordered
list. Ancestor links hide their underline by default and show it on hover.
The unlinked final item displays the current page title in bold and has
`aria-current="page"`. The entire trail is excluded from Pagefind indexing.
Decorative, accessibility-hidden chevron [icons](icons.md) in `var(--fg2-color)` separate items. The trail is left-aligned, wraps on
narrow screens, and works with JavaScript disabled.

When view transitions are available and reduced motion is not requested, client
navigation animates the trail as a single `page-breadcrumbs` group. Every item,
including the current one, moves together when the trail's position changes
between page layouts (for example, between a full-width TOC page and a regular
page). The old and new trails crossfade inside the group: unchanged items stay
opaque, and added or removed items fade. Snapshots keep their natural size, so
a change in trail width does not stretch the text.
The trail only receives its own transition when its heading is visible; if it
is visible on just one side, it fades in or out. The temporary name is cleared
after navigation or when a new navigation interrupts it. Without the API, or
with reduced motion enabled, navigation swaps the content immediately.
