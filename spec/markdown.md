# Markdown Processing

Markdown files (`.md`, `.markdown`) are processed with standard Markdown plus
several extensions.


## Syntax highlighting

Code blocks with a language identifier are syntax-highlighted at build time.
Supported languages are determined by the site config.

Syntax highlighting is done by [Shiki](https://shiki.style/). Comments are
rendered with the site's secondary foreground color instead of the theme's
default comment color, for stylistic consistency with the rest of the site.


## Heading subtitles

A heading can include a subtitle separated by ` # `:

```
## Main Title # Subtitle
```

The subtitle renders in a distinct style after the main heading text.


## Alerts

Block-level callouts for notes and warnings:

```
!!! note
This is a note.
!!!

!!! warning Custom Title
This is a warning with a custom title.
!!!
```


## Question-and-answer blocks

Collapsible Q&A sections that reveal the answer on click:

```
??? question What is X?
The answer is here.
???
```


## Collapsible details

```
<<< details Summary text
Hidden content here.
<<<
```


## Sections

Generic section wrappers:

```
::: section
Content grouped into a section.
:::
```


## Two-column layout

Arrange content in two equal columns:

```
+++
First column content.
+++
Second column content.
+++
```

The three `+++` lines act as opening fence, column separator, and closing fence.
Each column's content is parsed as full Markdown (headings, lists, code blocks,
etc.). The output is a CSS Grid container with two equal-width columns.


## Footnotes

Footnotes use standard markdown-it footnote syntax (`[^name]` for the
reference and `[^name]: text` for the definition). Tada customizes the
rendering to use single-character labels styled with Inter's `ss06`
stylistic set, which displays each character inside an outlined square.

The label sequence is:

- footnotes 1 through 9 use the digits `1` through `9`
- footnotes 10 through 35 use the capital letters `A` through `Z`

This scheme keeps every label to a single character so the squared glyphs
render correctly. Multi-digit numbers like `10` would otherwise display as
two separate squares.

The hard maximum is 35 footnotes per page. Building a page with more than
35 footnotes fails the build with a clear error message.

The footnote section at the bottom of the page is a `<div class="footnotes">`
containing a `<p class="title">Footnotes</p>` heading and an `<ol>` list.
The default ordered-list markers are suppressed with `list-style: none` and
each `<li>` begins with a `<span class="footnote-marker">` that holds the
visible label. In-text references use `<a class="footnote-ref">`. Both the
marker span and the in-text reference apply `font-feature-settings` with
`ss06` enabled.


## Other extensions

- **Definition lists**: terms followed by `: definition`, with auto-generated IDs
- **Smart typography**: curly quotes
