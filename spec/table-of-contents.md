# Table of Contents

When a page's front matter sets `toc: true`, a table of contents is generated
and displayed in a floating sidebar.

## Sources

TOC entries are collected from:

- Headings (with auto-generated IDs for linking)
- Alert blocks (notes and warnings), at the top level or directly inside a
  section; alerts nested in details or other containers are excluded
- Horizontal rules (rendered as visual separators in the TOC)

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
