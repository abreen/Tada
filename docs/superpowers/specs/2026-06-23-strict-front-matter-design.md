# Strict Front Matter for Tada 2

## Scope

Remove Presto-compatible delimiterless front matter. Full `.md`, `.markdown`,
`.mdx`, and `.html` content pages, including literate Java pages, must start
with a YAML front matter block delimited by `---` lines.

Markdown partials are unaffected because Tada renders them directly as MDX and
does not parse page front matter from them. Unknown and unprocessed file types
remain literal.

## Parser Design

Replace the separate standard and delimiterless extraction paths with one
strict parser path backed by the existing `front-matter` package.

For processed page extensions, the parser will:

1. Require the first line, after trailing-whitespace normalization, to be
   `---`.
2. Normalize the opening delimiter before invoking `front-matter` so existing
   support for trailing whitespace and CRLF remains intact.
3. Reject a missing closing delimiter with a distinct error.
4. Return the parsed YAML attributes and body from a single package parse.

The parser continues to accept empty front matter, blank lines within YAML,
CRLF line endings, and trailing whitespace on opening and closing delimiters.

## Error Contract

A processed page without an opening delimiter fails immediately with a message
stating that front matter must start with `---`. A page with an opening
delimiter but no closing delimiter retains the existing missing-closing error.

## Migration and Tests

Delete delimiterless parser tests and replace them with strict-error tests for
all processed page extensions. Migrate repository fixtures to delimited YAML,
remove the Presto-compatible section from `spec/front-matter.md`, and document
the breaking change in `spec/migration-2.md`.

Verification includes focused front matter and source-model tests, the complete
unit suite, typechecking, linting, Playwright, and functional tests.
