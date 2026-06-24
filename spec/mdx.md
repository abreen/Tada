# MDX Content

Tada 2 renders `.md`, `.markdown`, and `.mdx` content with MDX 3. JSX is the
only extension mechanism for authored Markdown; the Markdown-It container,
partial, heading-subtitle, and slides syntaxes from Tada 1 are not accepted.

MDX is compiled and evaluated at build time by Tada's static JSX runtime. The
result is ordinary HTML. React and the MDX runtime are not sent to browsers.
Interactive widgets progressively enhance useful build-time HTML.

## Scope

Page bodies and partials receive immutable `page`, `site`, and `vars` values:

```mdx
# {page.title}

Welcome to {site.title}. The course code is {vars.courseCode}.
```

These are native MDX JavaScript expressions. Author `import` and `export`
statements are rejected so the build and watch dependency graph remains
explicit.

Use native MDX comments for content that should not render:

```mdx
{/* This is removed from the generated HTML. */}
```

## Components

The built-in component API is:

- `<Note title={node}>` and `<Warning title={node}>`; `title` is optional
- `<Details summary={node}>`; `summary` is required
- `<Section>`
- `<Columns>` with exactly two direct `<Column>` children
- `<Question prompt={node}>`
- `<MultipleChoice prompt={node}>` with at least two direct `<Choice>` children
  and exactly one boolean `correct` prop
- `<Partial source="_fragment.md" />`
- `<Slides>` with one or more direct `<Slide>` children
- `<Trace source="Demo.java" companions={["Helper.java"]} />`
- `<TimeZoneChooser />`
- `<Subtitle>` inside a Markdown heading

`title`, `summary`, and `prompt` accept strings or JSX nodes. Components reject
unknown props and invalid child structures at build time.

Markdown inside a component is parsed normally when it is separated from the
tags by blank lines:

```mdx
<Note>

This body contains **Markdown**, a list, and other components.

</Note>
```

## Markdown Features

Tada retains fenced Shiki code blocks, heading IDs and TOC collection, smart
typography, external-link decoration, KaTeX `$...$` and `$$...$$`, footnotes,
definition lists, raw HTML/JSX, and standard CommonMark blocks. Use fenced code
blocks; MDX does not support indented code blocks.

## Errors

Tada reports component replacements when it encounters common 1.x syntax.
Legacy syntax inside fenced code blocks remains literal example text.
