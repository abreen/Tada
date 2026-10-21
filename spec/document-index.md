# Document Index

A document index arranges pages into an ordered tree. It is an `index.yml` or
`index.yaml` file anywhere in `content/`, and its paths are relative to the
directory that contains it. For example, `content/guide/index.yml` can contain:

```yaml
page: index.md
children:
  - install.md
  - page: topics/index.md
    children:
      - topics/configuration.md
      - topics/Example.java
```

The root and every branch are objects with a `page` and a nonempty `children`
list. A leaf can be written as just its path. Paths name source files, not
output URLs: `topics/Example.java` is the code page Tada builds at
`/guide/topics/Example.java.html`. A path is used literally, so a file named
`a%20b.md` is listed as `a%20b.md`, and links to it are encoded as
`a%2520b.html`. [Site variables](variables.md) can be used in index files.

Index files are read by the build and are not copied to the output. Every
file named exactly `index.yml` or `index.yaml` (other casings, such as
`Index.yml`, are ordinary content) in `content/` is read as a document index, so an
existing data file with one of those names must be renamed; this includes
sites that map `yml` or `yaml` to a code page language. An `index.json` file is
ordinary content and is copied like any other asset.

## Multiple trees

Each index file defines its own tree, so a site can have several, such as
`content/lectures/index.yml` and `content/labs/index.yml`. A page may appear in
only one tree. Pages that no index lists build normally, without document
navigation.

## Titles

Entries use each page's title: the rendered `title` from front matter for
Markdown, HTML, and literate Java pages, after site variables are substituted,
and the file name for code pages. Index files do not repeat or override titles.
Every indexed page needs a title with text, including the home page, which
otherwise may omit one (see
[Front Matter](front-matter.md#home-page-without-a-title)). A title of only an
image has no text to use in the index or in search results. The title must be a string: one YAML
reads as a number, such as `title: 1.10`, fails the build because the text the
author wrote is lost, and must be quoted (`title: "1.10"`).

## Sidebar

An indexed page shows a `<nav aria-label="Document navigation">` with part of
its tree: the root, the path from the root to the page, the siblings of every
page on that path, and the page's own children. Branches off that path are
collapsed, so a page never includes its whole tree; following a branch's link
shows that branch's children on its page. The current page's link has
`aria-current="page"` and is bold. Only the current page is in the
foreground color; every other entry, including the root, is in the secondary
foreground color and turns to the foreground color on hover.

Labels keep their inline formatting, such as code and emphasis, and wrap onto
as many lines as needed, including long unbroken words. Links in a title are
unwrapped, since each label is already a link. An image's relative `src` is
made root-relative so it works from every page, and its `srcset` is dropped;
an image with only a `srcset` uses its first candidate as its `src`. `<source>`
elements, as in a `<picture>`, are dropped in favor of its fallback image. Nested entries hang from tree
guide lines. A branch has a junction dot on its connector: open when its
children are shown and filled when they are not. A code page's label, its
file name in one `<code>`, is plain monospace text without the code
background and padding, as in search results. The index has a rounded box in
the secondary background color, so inline code in other labels keeps its
padding and gets a 1px border in the label's text color, in every state,
instead of a background.

On screens at least 900px wide, the index sits in the left column beside the
body, below the page heading (title and page info), which spans both columns,
and above the [table of contents](table-of-contents.md) when the page has one.
The index and table of contents share a sidebar that scrolls with the page
until it reaches the header, then sticks `var(--gap)` below it, so the index's
box does not touch the header. Once stuck, the sidebar is never taller than
the viewport, so both stay in view; before the page scrolls, its end can sit
below the viewport by up to the heading's height. The
table of contents takes priority: it is shown whole when it fits, and the index
takes the rest of the sidebar. When the sidebar runs out of room, the index
gives up its height first, down to its minimum, and only then does the table
of contents scroll. Without a table of contents, the index can take the whole
sidebar. On narrower screens, the
index is stacked above the body, below the heading and above the table of
contents. Code pages, which hide their table of contents on narrow screens,
keep their index.

The index is never shorter than about six single-line entries, or than all
of its entries when it shows fewer than six; the build records how many
entries it shows on the index as the `--document-index-entries` custom
property. On narrow screens, a tall index is at most half the viewport's
height.

An index taller than its space scrolls inside its rounded box. Entries fade
out at an edge of the box while there are more entries past it, using
scroll-driven animations; browsers without them show no fade. A client component
centers the current page's entry in the index once the page loads, and again
whenever the index's height changes, such as when a shorter viewport shrinks
it. Other resizes, such as a wider viewport, keep where the reader scrolled
the index. Without JavaScript, browsers that support `scroll-initial-target`
start with the entry in view, and others start at the top of the tree.

The index is rendered at build time from ordinary links; its only client-side
behavior is keeping the current entry centered, so it works without
JavaScript. Client-side navigation
replaces it with the destination page's index like the rest of the page.

## Previous and next

The tree's order is depth first: a page, then each of its children in order.
At the end of an indexed page's content, a `<nav aria-label="Previous and next
pages">` links to the pages before and after it in that order, with
`rel="prev"` and `rel="next"`. The root has no previous link and the last page
has no next link. Like the page heading's bottom border, a 1px border in the
secondary foreground color, `var(--gap)` above the links, separates them from
the content. Each link is a borderless button showing a chevron and the page's
title, which keeps its inline formatting: the previous link sits at the start
with a chevron pointing back, and the next link sits at the end with a chevron
pointing forward. While a link shows the press colors, its chevron takes the
label's color. "Previous" or "Next" is visually hidden text before the title,
so screen readers announce the direction. A code page's title is plain
monospace text, as in the sidebar. Code in other titles is a chip at rest and,
while the link is hovered, focused, or pressed, has no background and a 1px
border in the text color, like code in every button.

Search results for pages below a tree's root name the root, as in
"Labs › Counting vowels" (see [Search](search.md)).

Both the sidebar and the previous and next links are left out of search
indexing, hidden in printed output, and hidden while presenting
[slides](slides.md).

## Breadcrumbs

Indexed pages have no [breadcrumbs](breadcrumbs.md): the index already shows
the path from the root to the page, so a trail would repeat it. An indexed
page that sets `breadcrumbs` in its front matter fails the build, naming the
index file that lists it.

## Errors

These problems fail the build, with a message that names the index file:

- A file that does not match the shape above (for example, an empty
  `children` list or an unknown key)
- A path that is absolute, contains `\`, `?`, or `#`, or contains an empty,
  `.`, or `..` segment
- A path to a file that does not exist, or that does not build a page, such as
  a partial, a page with `skip: true`, or a copied asset
- A page listed twice in one file, or by two index files
- An indexed page without a title, or whose title has no text
- Both `index.yml` and `index.yaml` in one directory

Problems in every index file are reported together, before any page is
rendered.

## Watch mode

Adding, editing, or deleting an index file, or changing anything an index uses,
such as a listed page's title, re-renders only the pages whose place in a tree
or whose displayed neighbors changed. Other pages are left alone. Indexes are
read again only when a change touches an index file, a listed page, or a
directory that holds one; a title is rendered again only when its text
changes.
