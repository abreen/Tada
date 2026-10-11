# Site Variables

Authors define site variables under `vars` in the site config and insert them
into content with double braces:

```yaml
# site.dev.yaml / site.prod.yaml
vars:
  courseName: Intro to Computer Science
  course:
    code: CS 112
    staffEmail: staff@example.edu
```

```md
Welcome to {{ courseName }} ({{ course.code }}). Email {{ course.staffEmail }}.
```

Variables are the only template syntax available to authors. There are no
conditionals, loops, or function calls, and author content is never run
through Lodash (Lodash is internal to Tada's own [templates](templates.md)).

## Syntax

- `{{ name }}` inserts `vars.name`. Whitespace inside the braces is optional.
- `{{ a.b.c }}` looks up a nested value with a dotted path.
- Names are JavaScript-style identifiers: letters, digits, `_`, and `$`, not
  starting with a digit.
- Only bare identifier paths are variables. Anything else between double braces
  is literal text, for example `{{ count + 1 }}`, `{{#if x}}`, or `{{ fn() }}`.
- Three opening braces start a [partial](partials.md) directive
  (`{{{ _partial.md }}}`), never a variable, so `{{{ name }}}` is literal text.
  A brace after a variable is ordinary text: `{a: {{ x }}}` inserts the value.
- `${name}` and Lodash delimiters (`<% %>`, `<%= %>`, `<%- %>`) are literal
  text.

## Escaping

Put a backslash before a variable to keep it as literal text: `\{{ name }}`
produces `{{ name }}` and the backslash is removed. Backslashes pair up: each
pair before a variable produces one literal backslash, so `\\{{ name }}`
produces `\` followed by the value, and `\\\{{ name }}` produces `\{{ name }}`.
Markdown is processed after substitution, so in Markdown text that backslash
then escapes a punctuation character at the start of the value, as usual.

Use this for code samples whose language uses the same syntax, such as Vue,
Jinja, Handlebars, or Mustache templates, Python f-string brace escapes, or
GitHub Actions expressions (`$\{{ secrets.TOKEN }}`).

In YAML (front matter and the `nav.*` and `authors.*` config files), a
backslash inside double quotes starts a YAML escape sequence, so
`title: "\{{ name }}"` is invalid YAML and fails the build. Escape the variable
in single quotes (`title: '\{{ name }} slides'`), in an unquoted value
(`title: \{{ name }} slides`), or with a doubled backslash inside double quotes
(`title: "\\{{ name }} slides"`).

## Scope

Variables resolve only against `vars` in the site config. Other config fields
(such as `title` or `basePath`) and page front matter are not available. To use
a config value in content, copy it into `vars`.

Only a value's own properties are looked up, so names like `constructor` or
`toString` do not resolve to built-in object properties.

## Values

- Strings are inserted as written. Numbers and booleans are converted to text.
- `null` inserts an empty string.
- Objects and arrays cannot be inserted; referencing one fails the build.
- A value becomes part of the text it is inserted into, so Markdown or HTML in
  a value renders like the surrounding source.

## Errors

Referencing a variable that is not defined in `vars` fails the build. The error
names the file and the variable, for example
`content/index.md: unknown variable "{{ courseNme }}"`, and suggests adding it
under `vars` or escaping it with `\{{`.

A YAML value that starts with a variable must be quoted. YAML reads
`title: {{ name }}` as a mapping and rejects `title: {{ name }} home`, so both
fail the build with `content/index.md: a value for "title" starts with an
unquoted {{ }} variable; quote it`. Write `title: "{{ name }} home"` instead.
This applies to front matter and to the `nav.*` and `authors.*` config files.

## Where variables are substituted

Substitution is plain text replacement, done before Markdown or HTML
processing, and applies everywhere in these files except comments (see below),
including code blocks, inline code, math, link URLs, and raw HTML:

- Markdown, HTML, and literate Java page bodies.
- [Markdown partials](partials.md), when each partial is included.
- Top-level string values in [front matter](front-matter.md), plus each
  [breadcrumb](breadcrumbs.md) entry's `label` and `url`.
- Source files in `content/` whose extension is mapped in
  `extensionToShikiLanguage`, on [code pages](code-pages.md), in their
  downloadable copies, and in [traces](traces.md) (the trace runs the
  substituted file). Other source files, unmapped ones and any outside
  `content/`, are never substituted, even when traced.
- String values in the `nav.*` and `authors.*` config files. Substitution
  cannot generate config structure, and the result is always a string.

Variables inside `<!--- -->` comments are ignored in every page type and
partial, so an undefined variable in a comment does not fail the build. The
exception is a [literate Java](literate-java.md) hidden code block (a comment
that holds a fenced code block): it is compiled with the page, so its variables
are substituted like visible code.

Variables are not substituted in the site config itself, `site.banner`, files
in `public/`, author scripts and styles in `src/`, or content files that are
copied without processing (such as PDFs and unmapped source files).

## Intended behavior

These are deliberate design decisions, not bugs. Do not report them in code
reviews:

- Content that uses `{{ }}` for another purpose (Vue, Jinja, Handlebars, Python
  f-strings, Rust `format!`, GitHub Actions, KaTeX, code samples) is
  substituted or fails the build. Authors escape it with a backslash.
- The old Lodash syntax (`<%= %>`, including `renderTrace(...)`) in author
  content, front matter, and config is not supported and renders as literal
  text with no error or warning. Backwards compatibility with it is not a goal.
- `{{ ... }}` whose contents are not a bare identifier path (for example
  `{{ course-name }}` or `{{ items.0 }}`) is literal text, not an error.
- Three opening braces are partial syntax, so `{{{ name }}}` is literal text
  wherever it appears, for example in KaTeX `\text{{{ name }}}`. Authors add a
  space: `\text{ {{ name }} }`.
