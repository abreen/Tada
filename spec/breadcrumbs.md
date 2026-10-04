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

The trail renders before, and outside, the `.title-and-info` heading block as
the first row of the page grid. It is a sticky bar: it scrolls with the page
until it reaches the fixed site header, then stays pinned directly below it, so
the current title and ancestor links remain visible and clickable anywhere on
the page. The bar has a fixed one-line height (`--breadcrumbs-height`), spans
the content column including its side gutters, and sits above page content but
below the header and the open-menu overlay.

The bar only has a background while it is stuck: the `breadcrumbs` client
component adds `is-stuck` once the trail reaches its sticky offset and removes
it when the trail returns to normal flow. While stuck it uses the header's
translucent background, backdrop blur, and bottom border (an opaque background
with high contrast); otherwise the trail is plain text above the heading.
Bun's CSS bundler cannot parse `scroll-state()` container queries, so the stuck
state is detected from script. With JavaScript disabled, the bar background is
always shown so pinned text never overlaps page content.

The trail never wraps. The current title takes only the space the ancestors
leave and truncates with an ellipsis first; ancestors truncate only when they
alone do not fit. Every item keeps a minimum width, so the current item and
each separator stay visible on narrow screens without horizontal page
scrolling. Links and the current item carry a `title` attribute with their full
text.

On pages with a trail, the document `scroll-padding-top` includes the bar's
height so fragment targets land below it, and the desktop sticky table of
contents starts below it. TOC active-section tracking measures from the bar's
bottom edge. In print the trail renders in normal flow without the bar styling,
and it is hidden during slide presentation.

When view transitions are available and reduced motion is not requested, client
navigation preserves the shared prefix of the old and new trails. Items match
by displayed label and resolved page URL (including query strings, ignoring
fragments). Relative links resolve from each page, including during history
navigation. The current item participates using its page URL, so an ancestor
link can become the italic current title when navigating up the trail.

Shared items remain opaque and stay in place when their layout is unchanged,
moving smoothly if truncation changes their position. Removed items and their
separators fade out, and new items fade in.
Items receive their own transition whenever the trail is visible, which
includes when it is stuck below the header on a scrolled page; if a matching
item is visible on just one side, it fades in or out. The page title and info
only receive their own transitions when the heading is not covered by the
header or the trail. Temporary names and transition rules are cleared after
navigation or when a new navigation interrupts it. Without the API, or with reduced motion enabled, navigation
swaps the content immediately.
