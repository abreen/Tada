# Table of Contents

When a page's front matter sets `toc: true`, a table of contents is generated
and displayed in a floating sidebar.

## Sources

TOC entries are collected from:

- Headings (with auto-generated IDs for linking)
- Alert blocks (notes and warnings with titles)
- Horizontal rules (rendered as visual separators in the TOC)

## Code pages

For Java code pages, the TOC is generated from the source structure instead of
from headings. It lists methods, constructors, and fields with their line
numbers.

## Scroll tracking

The client-side TOC component highlights the entry corresponding to the
currently visible section as the user scrolls.
