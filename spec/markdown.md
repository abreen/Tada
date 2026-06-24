# Markdown Processing

Tada 2 treats `.md`, `.markdown`, and `.mdx` as MDX 3 documents. All three
extensions have the same syntax, front matter flow, built-in components, and
output paths. See [MDX Content](mdx.md) for the component API.

## Standard Features

- CommonMark paragraphs, headings, emphasis, links, blockquotes, and lists
- raw HTML and JSX
- fenced code blocks highlighted by Shiki at build time
- heading IDs and table-of-contents collection
- external-link decoration
- smart typography
- `$...$` inline and `$$...$$` display math rendered by KaTeX
- footnotes with Tada's single-character labels
- definition lists with generated term IDs

Indented code blocks are not supported by MDX; use backtick or tilde fences.

## Tada Structures

Alerts, details, sections, columns, questions, multiple choice, subtitles,
partials, slides, traces, and the time-zone chooser are JSX components. Tada 1
container markers such as `!!!`, `???`, `+++`, and `{{{ ... }}}` are removed.

## Static Output

MDX runs only during the build. Tada's JSX runtime produces static HTML and
validates built-in component props and child structures. Client JavaScript is
only progressive enhancement for widgets that need interaction.
