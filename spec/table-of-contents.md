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

The client pairs each TOC link with a page element by position, so it applies
the same rules for headings and alerts. Horizontal rules have no link, so the
client does not track them.

Each alert entry links to its own generated title ID, including when nested
alerts share its title. These links are rendered at build time and work without
client-side JavaScript.

## Code pages

For Java code pages, the TOC is generated from the source structure instead of
from headings. It lists methods, constructors, and fields with their line
numbers.

## Scroll tracking

The client-side TOC component highlights the entry corresponding to the
currently visible section as the user scrolls.
