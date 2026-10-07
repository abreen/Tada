# Markdown Processing

Markdown files (`.md`, `.markdown`, case-insensitive) are processed with standard
Markdown plus several extensions. Generated `.html` pages preserve the source
basename's case.


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

Inline code inside an alert keeps its default padding but has no background
chip, which would clash with the alert's colored background. A 1px border in
the primary foreground color marks it instead. In print the border is the
same light gray as other inline code. Code inside a fenced block in an alert is
unaffected and uses the normal code block styles. The chip is removed only where
a `<code>` element is the whole element, such as a code page's file title, the
header title, search result titles, and a multiple-choice option that contains
only code.


## Question-and-answer blocks

Collapsible Q&A sections that reveal the answer on click:

```
??? question What is X?
The answer is here.
???
```

With JavaScript enabled, an unrevealed answer occupies its normal space behind
one rectangular placeholder. Its concealed content is excluded from keyboard
focus and the accessibility tree until the answer is revealed. The reveal
control remains available to keyboard and assistive technology users.
A build-time content wrapper lets CSS fade the
entire answer in as one visual unit over 0.25 seconds, while the placeholder and
reveal hint fade out. Nested markup such as definitions and KaTeX keeps its
normal styling and shares the same opacity transition; hidden math cannot paint
outside the placeholder. Reduced motion disables the fade. Without JavaScript,
answers are visible. Printed Q&A blocks always show their answers and omit both
the placeholder and reveal hint.

If a `question` block's body is entirely a checked-list option set, it renders
as a multiple choice block instead. Options use the existing `Q.` prompt style
with no `A.` label:

```
??? question Which option is correct?
- [ ] First option
- [x] Correct option
- [ ] Third option
???
```

Exactly one option must be marked `[x]` or `[X]`. The option marker must use
standard Markdown list spacing, such as `- [ ] Option`.


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
etc.). Delimiter lines inside fenced code blocks (backticks or tildes) or
indented code blocks remain literal code, including `+++`. An unclosed code
fence consumes the remaining content rather than supplying column boundaries.
The output is a CSS Grid container with two equal-width columns.

## Superlinks

A superlink is a link rendered on two lines: a title, with a description
beneath it. Write it as two bracketed labels followed by a destination:

```
[Problem Set 1][Due Friday](/problem_sets/ps1.html)
```

The two labels must be directly adjacent (`][`), and the destination follows
immediately in parentheses. Whitespace inside the parentheses is allowed. A link
title string is not supported. Both labels accept inline Markdown (emphasis,
code spans) but must not be empty or contain links, including autolinks
(`<https://example.com>`) and raw `<a>` tags, because an anchor inside the
superlink's anchor is invalid HTML. A label with one is not a superlink.

The syntax takes precedence over CommonMark reference links: `[A][B](/x.html)` is
a superlink even when a reference named `B` is defined. Anything that does not
match this exact form, such as a space between the labels, an empty label, or an
unsafe destination like `javascript:`, is parsed as ordinary Markdown. A first
label that starts with `^` is also left alone, so a footnote reference directly
followed by a link (`text[^1][source](/x.html)`) still renders as a footnote
reference and a link.

The output is a single anchor with two block-level spans, separated by a
newline so that text extraction (search indexing, copy and paste) keeps the last
word of the title apart from the first word of the description:

```
<a href="/problem_sets/ps1.html" class="button superlink"><span class="superlink-title">Problem Set 1</span>
<span class="superlink-description">Due Friday</span></a>
```

The `href` goes through the same base path rewriting, link validation, and
client-side navigation marking as any other link (see
[Link Processing](link-processing.md)). External destinations open in a new tab
with `rel="noopener noreferrer"` and are given the `external` class, which shows
the external-link icon in place of the chevron. Unlike ordinary external links,
the last word is not wrapped in an `external-link-tail` span, because the icon
sits at the right edge rather than after the text.

A superlink is a block-level link that keeps the `button` class, so it shares
the border, background, hover, focus, and pressed styles of `a.button`. It is
left-aligned and inherits the surrounding font size (so it scales with its
container, for example in slides), uses half the `--gap` block padding, and has
extra inline end padding to clear the chevron. The title has font weight
600, and the description has normal weight and is colored with `--fg2-color`. A
right-pointing chevron (the `breadcrumb-separator` mask icon) is drawn with
`::after` at the right edge, vertically centered, in `--fg2-color` (the same
color as the border and description). On an external superlink the shared
`a.external` rules replace it with the `external-link` icon in the same color,
shifted left by half the difference in the two icons' box sizes so that both
share the same center.
Adjacent superlinks, such as consecutive
lines of a paragraph, are separated by `--gap`. This is HTML and CSS only, so it
behaves the same with JavaScript turned off.

Because a superlink is a block element, it should not be used inline, in the
middle of a paragraph, or in a heading: it breaks the surrounding text onto
separate lines, and in a heading it would nest a block-level link in the table
of contents entry. Superlinks belong on their own lines.

## Slides

When a Markdown page's front matter sets `slides: true`, top-level thematic
breaks (`---`) in the page body are treated as slide separators instead of
rendering as `<hr>` elements. Tada wraps the rendered content in a
`<div class="slide-deck" data-slides-root>` container and wraps each slide in a
`<div class="slide" data-slide-index="N">` wrapper.

In the normal page view, those wrappers stay in regular document flow so the
page still reads like a standard Markdown page. Leading, trailing, and
consecutive separators do not create empty slides.

Only top-level thematic breaks split slides. Separators nested inside other
block constructs are omitted instead of starting a new slide. Slide pages also
suppress literal HTML `<hr>` tags, so the rendered page contains no `<hr>`
output at all.

Heading collection for the table of contents still works on slide pages, but
removed separators do not appear as dinkus items. For the browser presentation
behavior, see [Slides Mode](slides.md).


## Footnotes

Footnotes use standard markdown-it footnote syntax (`[^name]` for the
reference and `[^name]: text` for the definition). References use ordinary
superscript numbers, and definitions use the browser's standard ordered-list
markers so the treatment works with every body font.

The footnote section at the bottom of the page is a `<div class="footnotes">`
containing a `<p class="title">Footnotes</p>` title (italic, muted, and centered so it does not read as a heading) and an `<ol>` list.
Each definition retains its backlink and target highlight.


## Other extensions

- **Definition lists**: terms followed by `: definition`, with auto-generated IDs
  derived from readable text, including inline code. For example, a term written
  as `` `Map` `` gets the ID `map`. Repeated slugs receive numeric suffixes
  (`map-2`, `map-3`), including when plain and inline-code terms have the same text.
- **Smart typography**: curly quotes
