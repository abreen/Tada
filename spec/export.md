# Export

`tada export` writes a site's content as plain GitHub Flavored Markdown, so it
can be read on GitHub or moved to another tool without Tada.

```
tada export (--dev | --prod) [--out <dir>] [--force]
```

- `--dev` or `--prod` chooses the site config that supplies
  [site variables](variables.md) and `extensionToShikiLanguage`. Exactly one is
  required; the command does not assume either.
- `--out <dir>` sets the output directory, relative to the project directory
  (default: `exported`). It cannot be, contain, or be inside `content/` or
  `public/`, or be the project directory. Paths are compared without case, so
  `--out Content` is refused too.
- The command fails if the output directory is not empty, unless `--force` is
  passed, which replaces it. `--force` only replaces an earlier export, which
  Tada marks with an empty `.tada-export` file; any other directory that is
  not empty, such as `src/` or `.git/`, is never replaced.

Every page is converted first, then the export is written to a new directory
beside the output directory (`<dir>.tmp-<pid>-<time>`) and moved into place. An error
at any step leaves an earlier export as it was. Errors match the build's, such
as a broken [wikilink](wikilinks.md) or an unknown variable. Nothing in
`content/` changes.

## Files

The export mirrors `content/`, with `public/` files at its root, as the build
publishes them:

| Source | Export |
|---|---|
| Markdown pages (`.md`, `.markdown`) and literate Java pages (`.java.md`) | Converted Markdown, at the same path |
| Literate Java pages | Also the extracted Java source (`Foo.java`), as the build publishes it |
| HTML pages | The same path, without front matter, with variables substituted and links rewritten |
| Code page sources | The same path, with variables substituted, as the build publishes them |
| Other content files, `public/` files | Copied unchanged |
| Partials, `index.yml`/`index.yaml` document indexes, pages with `skip: true` | Left out |

The export fails when two sources would be exported at the same path, even
where the build publishes them at different URLs: `content/notes.md` (built
as `notes.html`) and `public/notes.md` would both be `notes.md`. Paths that
differ only in case count as the same. It fails too when one source would be
exported as a file at a path another source needs as a directory, such as
`public/notes` and `content/notes/a.md`. It also fails, as the build does,
when two sources write the same build output.

## Pages

Front matter is removed. A page's `title`, after variable substitution, becomes
a `# Title` heading at the top of a Markdown page, or an `<h1>` (with its
inline Markdown rendered) at the top of an HTML page. A home page without a
title gets no heading. Other front matter fields are dropped. Links and
wikilinks in a title are converted like the body's, a title's line breaks
become spaces, as they do in the build, and a trailing `#` is escaped so it
stays part of the heading.

Site variables are substituted and `\{{` escapes are resolved as in the build.
`<!--- -->` comments are removed, except on literate Java pages, which keep
them as the build does.

## Markdown conversions

| Tada | Export |
|---|---|
| `{{{ _partial.md }}}` | The partial's text, with nested partials included, each line prefixed like the directive's line (for example `> ` in a blockquote), and blank lines added around it so it does not join the text before or after it (not inside a list item, where they would make a tight list loose) |
| `[[Title]]`, `[[Title\|text]]` | `[Title](path.md)`, `[text](path.md)` |
| `[Title][Description](url)` | `[Title](url) - Description`; a superlink followed by a line break ends with `\` so the next one stays on its own line |
| `!!! note` / `!!! warning` | `> [!NOTE]` / `> [!WARNING]`; a custom title becomes a bold line under the marker, with its punctuation escaped so it shows literally, as in the build |
| `??? question Q`, including multiple choice | `<details>` with `<summary>Q</summary>` and the answer, or the options' task list, as its body, followed by a blank line so the text after it stays Markdown |
| `[Label\|` … `]` tabs, including steppers | One `<details>` per tab, with the label as its `<summary>`, each followed by a blank line |
| `+++` columns | Fence lines become blank lines; the columns follow one another |
| `## Main # Subtitle` | `## Main - Subtitle` |
| Definition lists | `<dl>` with `<dt>` and `<dd>` elements, each holding Markdown between blank lines |
| ` ```trace ` blocks (any fence whose first info word is `trace`) | One fenced code block per listed file, with the file's contents as the build publishes them, in the language mapped from its extension. A trace the build rejects, such as one mixing languages, repeating a basename, or on a literate Java page, fails the export with the build's error |

Summaries are rendered to HTML, since GitHub does not parse Markdown inside
`<summary>`. Everything else is kept as written, including math, footnotes,
`<details>` elements, and slide separators. Code spans and code blocks are
never changed.

## Links

Links in Markdown (inline links, images, reference definitions, superlinks)
and `href` and `src` attributes in raw HTML point to exported files:

- A link to a page built from Markdown points to its `.md` file, and a link to
  a code page points to the source file. A link to a literate Java page's
  source (`Foo.java`) points to the exported source.
- In raw HTML, only the `href` and `src` values change, so a tag that spans
  lines keeps any `> ` markers an alert added to it.
- Root-relative links become relative to the page, since the export has no
  base path.
- A relative link to a file exported at the same path is left as written.
- External links, fragments, and `mailto:` links are unchanged.
- A link (a Markdown link, superlink, or `<a href>`) to a path the build does
  not publish fails the export with the build's `broken internal link` error,
  and a link to a directory with an `index.html` fails with the build's
  `directory link must reference index.html explicitly` error. Like the build,
  the export does not check `<a>` elements inside SVG or MathML. A reference
  definition that a link uses is checked like the link. As in the build,
  images, `src` attributes, and definitions only images use are not checked.
  A link to a file the build generates but the export leaves out is made
  relative and kept.
- Attribute values in raw HTML are read with their character references
  decoded, as the build reads them, and written back escaped.

Query strings and fragments are kept.
