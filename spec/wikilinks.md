# Wikilinks

A wikilink links to another page by its title, as on Wikipedia. Write the
page's front matter `title` in double brackets, optionally followed by `|` and
the link text:

```
See [[Linked Lists]] or [[Linked Lists|the lecture on lists]].
```

Links are resolved at build time into ordinary anchors, so they work without
JavaScript.

## Matching

The text between `[[` and the first `|` (or `]]`) must match a page title
exactly, after [site variables](variables.md) in the title are substituted:
matching is case-sensitive, and only whitespace around the title is ignored.
For a title written with inline Markdown, such as ``title: Using `git` ``, the
wikilink uses the same source text: ``[[Using `git`]]``.

Any page with a text title can be a target: Markdown, HTML, and literate Java
pages. Skipped pages, partials, code pages, and a home page without a title
cannot. A title that YAML reads as a number or `true`/`false`, such as
`title: 1.10`, is not text and must be quoted (`title: "1.10"`) to be linked.

Page titles come from the project scan, which reads each page's front matter
once (see [Build Pipeline](build-pipeline.md#shared-build-internals)).

## Link text

Without `|`, the link text is the title, rendered as inline Markdown like the
page heading. `\|` also separates the title from the link text, which a table
cell needs, since `|` alone ends the cell: `| [[Linked Lists\|lists]] |`. Text after `|` is also inline Markdown, but it must not contain a
link, including an autolink or a raw `<a>` tag; this fails the build.

## Where wikilinks work

Wikilinks work in the body of Markdown and literate Java pages, including
footnotes, and in Markdown partials. In a heading, the wikilink is a link in
the heading, but plain text in the table of contents entry. They do not work in front matter, HTML pages, code pages,
code spans, or fenced code. `\[[Title]]` is left as text.

Text that does not match the form is parsed as ordinary Markdown: an empty
title or link text, a newline or `[` inside the brackets, or no closing `]]`.
So are links whose text is in brackets: `[[1]](https://example.com)` is an
ordinary link with the text `[1]`, and so is `[[1]][ref]` when the page defines
a `[ref]` reference. `[[1]]` is a reference link in brackets when the page
defines a `[1]` reference and no page has the title `1`. A wikilink followed by
a footnote reference (`[[Title]][^1]`) or an undefined reference stays a
wikilink.

Inside a Markdown link, the wikilink wins and the outer link is left as text,
as with nested Markdown links. A wikilink inside a raw `<a>` tag fails the
build, because anchors cannot nest. In image alt text, a wikilink is not
resolved; its text becomes part of the alt text.

Section links (`[[Title#Section]]`) are not supported: `#` is part of the title.
A title containing `]]`, `|`, or `[` cannot be linked.

## Errors

The build fails when no page has the title, or when more than one page has it:

```
content/index.md: broken wikilink "[[Linked lists]]": no page has the title "Linked lists"
content/index.md: ambiguous wikilink "[[Notes]]": "Notes" is the title of /a/notes.html, /b/notes.html
```

Pages may share a title as long as no wikilink names it. When some pages have
titles that cannot be linked, the broken-link error lists them with the
reason: the title is not text, has a variable that cannot be substituted, or
its front matter has an error. A page whose front matter fails only for another
field, such as an unquoted variable in its `description`, can still be linked;
the page itself reports its error.

An error in a partial, including one in a footnote there, names the partial,
not the page that includes it.

## Output

The output is an ordinary anchor to the page's root-relative URL, with each
path segment percent-encoded:

```
<a href="/lectures/linked-lists.html">Linked Lists</a>
```

It goes through the same base path rewriting, link validation, and client-side
navigation marking as any other link (see [Link Processing](link-processing.md)).

## Watch mode

Each page records the titles its wikilinks name, whether or not they resolved.
When a changed page gains, loses, or moves a title, the pages that name that
title are re-rendered (see [Watch Mode](watch-mode.md#page-title-change)). A
wikilink that no longer resolves fails the build until a page has the title
again.
