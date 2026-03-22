# Code Pages

When the code feature is enabled, source code files in the content directory are
rendered as browsable, syntax-highlighted HTML pages. The set of recognized file
extensions is configured via `codeLanguages` in the site config (Java and Python
by default).

Each code page includes:

- Full syntax-highlighted source
- Line numbers linked as anchors
- A download button for the original file

## Markdown documentation comments

Java files that use Markdown documentation comments (`///`, introduced in Java
25) receive special treatment. Consecutive `///` lines are extracted, rendered as
Markdown, and displayed inline between the surrounding code segments. The
rendered prose preserves the indentation level of the original comments.

When a user copies a section that includes rendered prose, the original `///`
comment lines are restored in the clipboard so that pasted text is valid Java
source.

## Java table of contents

For Java files, a table of contents is automatically generated from the source
structure, listing methods, constructors, and fields with their line numbers.
Inner class members are excluded.

Links to code files elsewhere on the site are automatically rewritten to point
to the generated HTML page instead of the raw source file
(see [Markdown Link Processing](markdown-link-processing.md)).
