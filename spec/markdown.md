# Markdown Processing

Markdown files (`.md`, `.markdown`) are processed with standard Markdown plus
several extensions.


## Syntax highlighting

Fenced code blocks with a language identifier are syntax-highlighted at build
time. Supported languages are determined by the site config.


## Heading subtitles

A heading can include a subtitle separated by ` # `:

```markdown
## Main Title # Subtitle
```

The subtitle renders in a distinct style after the main heading text.


## Alerts

Block-level callouts for notes and warnings:

```markdown
!!! note
This is a note.
!!!

!!! warning Custom Title
This is a warning with a custom title.
!!!
```


## Question-and-answer blocks

Collapsible Q&A sections that reveal the answer on click:

```markdown
??? question What is X?
The answer is here.
???
```


## Collapsible details

```markdown
<<< details Summary text
Hidden content here.
<<<
```


## Sections

Generic section wrappers:

```markdown
::: section
Content grouped into a section.
:::
```


## Other extensions

- **Footnotes** -- standard footnote syntax
- **Definition lists** -- terms followed by `: definition`, with auto-generated IDs
- **Smart typography** -- curly quotes
