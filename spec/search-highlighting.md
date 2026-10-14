# Search Highlighting

A page opened from a search result highlights the words that were searched
for, as if someone had dragged a highlighter over them.

## Links

The search component loads Pagefind with `highlightParam` set to
`pagefind-highlight`, so every result and sub-result link carries one
`pagefind-highlight` query parameter per search word, for example
`/notes.html?pagefind-highlight=odd&pagefind-highlight=number#tabs`. Links to
PDFs omit the parameter, because a PDF cannot use it. The parameter stays in
the address bar, so reloading or sharing the URL highlights the same words.

## Highlighting

The `highlight` client component runs on every page, including after
client-side navigation, and does nothing unless the URL has the parameter.
Otherwise it loads Pagefind's highlighter (`/pagefind/pagefind-highlight.js`),
which marks matches with the same rules the index used, inside the indexed
parts of the page (`data-pagefind-body`). Matches are wrapped in
`<mark class="search-highlight">`.

Nothing is marked inside elements excluded from the index
(`data-pagefind-ignore`), such as code line numbers, the no-JavaScript labels
of [tabs](tabs.md), and [trace widgets](traces.md), or inside text that is
never shown: the hidden member list of code pages and the MathML copy of
rendered math.

Pagefind marks each word separately. Marks separated only by whitespace are
joined into one, so a matched phrase is highlighted as a single stroke. Words
in different elements, such as a word in emphasis next to plain text, stay
separate strokes.

## Revealing the first match

The first highlight at or after the URL's fragment target, or the first on the
page when there is no fragment, is revealed: if it is inside an inactive tab,
that tab is selected (along with any enclosing tabs), and if it is inside a
closed [details preview](details.md#previews), the preview is opened.
Highlights inside any other closed `<details>` are skipped, and so are
highlights in a tab whose selection would hide the fragment target.

Without a fragment, the page scrolls so that highlight is centered; with one,
the page keeps the fragment's scroll position. When client-side navigation
restores a saved scroll position (going Back or Forward to the page, or a dev
server refresh), the page keeps it instead of jumping to the highlight again.
Reloads keep no scroll position, so they scroll to the highlight again.

A fragment change on the same page while Pagefind's highlighter loads, such as
following a table of contents link, does not cancel highlighting.

## Animation

The highlight is a background image that sweeps from left to right. Across a
mark that wraps, the background is laid out as one strip over all of its line
fragments, so the sweep runs to the end of the first line before continuing on
the next.

Each highlight sweeps once, when it first comes into view; a highlight in an
inactive tab sweeps when its tab is shown. Highlights that come into view
together sweep one after another in reading order, at a pace proportional to
their length (12ms per character, from 150ms to 1.2s) with a 60ms pause
between strokes. Every highlight finishes within one second of coming into
view: a group that would take longer is sped up evenly, and a group that
appears while earlier highlights are still sweeping waits at most 300ms for
them.

With reduced motion, highlights appear without sweeping.

## Colors

The ink is `--search-highlight-color`, a translucent highlighter yellow that
keeps text readable in the light and dark themes, and an opaque yellow in the
high-contrast themes.
