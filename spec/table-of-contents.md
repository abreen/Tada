# Table of Contents

When a page's front matter sets `toc: true`, a table of contents is generated
and displayed in a floating sidebar.

## Sources

TOC entries are collected from:

- Headings (with auto-generated IDs for linking)
- Alert blocks (notes and warnings), unless nested inside another alert or a
  question block
- Horizontal rules (rendered as visual separators in the TOC), under the same
  nesting rule as alerts

Nothing inside a raw HTML `<details>` element is listed, whether it is a
heading, an alert, or a horizontal rule, because it is hidden until the
`<details>` is opened. Other raw HTML wrappers, such as `<section>` or a column
`<div>`, do not affect which entries are listed.

The client tracks each TOC link's target (the element its `href` names), so
page elements the TOC does not list, such as raw HTML headings, never affect
which entry is current. Horizontal rules have no link, so the client does not
track them.

Each alert entry links to its own generated title ID, including when nested
alerts share its title. These links are rendered at build time and work without
client-side JavaScript.

## Code pages

For Java code pages, the TOC is generated from the source structure instead of
from headings. It lists methods, constructors, and fields with their line
numbers.

On code pages, the current entry is the one whose line is closest at or before
the first line of the URL's line hash (such as `#L12` or `#L12-L20`). No entry
is current without a line hash or when the hash's line comes before every
entry.

## Scroll tracking

The client-side TOC component highlights the entry corresponding to the
currently visible section as the user scrolls. Without JavaScript, no entry is
current.

Headings and alerts are both tracked, so an alert entry is highlighted on its
own rather than as part of the heading above it. An entry becomes current when
its link target (the heading, or the alert's title) reaches the page's
`scroll-padding-top` line (below the collapsed header), which is where the
browser places it when the entry's TOC link is clicked. The current entry is
the last one at or above that line, or the first entry before any is reached.

Targets in short final sections cannot scroll up to that line. When the page
is scrolled to its bottom, the URL hash's target is current if it is visible
and is not earlier than the entry at the line, so clicking any of those
entries' links makes it current. Otherwise the last visible target is current.
On a page that fits in the viewport, only the hash target can change the
current entry this way.

On wide screens (`width >= 900px`), the client adds an `aria-hidden` highlight
element inside `nav.toc`, just before the TOC list (never inside it), that
covers the current entry's link with a background and moves as the current
entry changes, on both regular and code pages. It is positioned relative to
the list, so it stays on the link when the list moves or the TOC scrolls. The
highlight is hidden when no entry is current, such as on a code page without a
line hash, and on narrower screens, where the client does not measure links.

The highlight animates its position and size only when the user has no
reduced-motion preference; with `prefers-reduced-motion: reduce` it moves
instantly. The preference is applied in CSS, so changing it while the page is
open takes effect immediately. The highlight does not animate until the user
has interacted with the page (pointer, keyboard, wheel, or touch input), so the
browser scrolling to a fragment or restoring a scroll position on load moves
it instantly. It also never animates when it first appears or when the layout
changes (for example, when fonts load).
