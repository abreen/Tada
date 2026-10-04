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
icons in `var(--fg2-color)` separate items. The trail is left-aligned, wraps on
narrow screens, and works with JavaScript disabled.

When view transitions are available and reduced motion is not requested, client
navigation preserves the shared prefix of the old and new trails. Items match
by displayed label and resolved page URL (including query strings, ignoring
fragments). Relative links resolve from each page, including during history
navigation. The current item participates using its page URL, so an ancestor
link can become the italic current title when navigating up the trail.

Shared items remain opaque and stay in place when their layout is unchanged,
moving smoothly if wrapping changes their position. Removed items and their
separators fade out, and new items fade in.
Items only receive their own transition when their heading is visible; if a
matching item is visible on just one side, it fades in or out. Temporary names
and transition rules are cleared after navigation or when a new navigation
interrupts it. Without the API, or with reduced motion enabled, navigation
swaps the content immediately.
