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
The unlinked final item displays the current page title in italics and has
`aria-current="page"`. The entire trail is excluded from Pagefind indexing.
Decorative, accessibility-hidden Material Symbols Outlined `chevron_right`
icons in `var(--fg2-color)` separate items. The trail is left-aligned and works
with JavaScript disabled.

The trail appears above the page heading. In browsers that support CSS
scroll-state container queries, it scrolls with the page until it reaches the
fixed site header, then stays pinned directly below it, so the current title and
ancestor links remain visible and clickable anywhere on the page. This works with
JavaScript disabled. While pinned, the trail looks like a second header bar with
the header's translucent background, blur, and bottom border (an opaque
background with high contrast). Before it is pinned, it has no background. The
pinned bar spans the content column and stays below the header and the open
menu. In other browsers the trail scrolls away with the page.

The trail is always one line. The current title shrinks first and truncates
with an ellipsis; ancestors truncate only when they alone do not fit. The
current item and every separator stay visible on narrow screens, and the page
never scrolls horizontally. Hovering any item shows its full text.

When the trail is pinned, links to headings on the page land below it, and the
desktop table of contents starts below it. In print the trail is not pinned and
has no bar styling, and it is hidden during slide presentation.

When view transitions are available and reduced motion is not requested, client
navigation preserves the shared prefix of the old and new trails. Items match
by displayed label and resolved page URL (including query strings, ignoring
fragments). Relative links resolve from each page, including during history
navigation. The current item participates using its page URL, so an ancestor
link can become the italic current title when navigating up the trail.

Shared items remain opaque and stay in place when their layout is unchanged,
moving smoothly if truncation changes their position. Removed items and their
separators fade out, and new items fade in. Items transition whenever the trail
is visible, including when it is pinned on a scrolled page; if a matching item
is visible on just one side, it fades in or out. The page title and info only
transition when the heading is not covered by the header or the trail. A page
restored scrolled down shows the pinned bar throughout its transition.
Temporary names and transition rules are cleared after navigation or when a new
navigation interrupts it. Without the API, or with reduced motion enabled,
navigation swaps the content immediately.
