# Code Pages

Source code files in the content directory are rendered as browsable,
syntax-highlighted HTML pages when their extension is configured in
`extensionToShikiLanguage`. If that field is omitted or empty, Tada does not
generate code pages for source files.

Each code page includes:

- Full syntax-highlighted source
- Line numbers linked as anchors
- A download button for the original file

## Markdown documentation comments

Java files that use Markdown documentation comments (`///`, introduced in Java
25) receive special treatment. Consecutive `///` lines are extracted, rendered as
Markdown, and displayed inline between the surrounding code segments. The
rendered prose preserves the indentation level of the original comments. These
comments support the same build-time KaTeX math syntax as Markdown pages, so
authors can write inline math such as `$E = mc^2$` and display math with `$$`.
The prose block uses the same background as inline code, so inline code in
comments keeps its default padding and gets a 1px border in the secondary
foreground color instead of a background (light gray in print). Fenced code
blocks in comments are unaffected.

When a user copies a section that includes rendered prose, the original `///`
comment lines are restored in the clipboard so that pasted text is valid Java
source. Markdown links in these comment lines are rewritten to full URLs
(using `base` + `basePath`) so they resolve when the source is viewed outside
the site. The same rewriting is applied to the downloaded copy of the source
file. Java filename extensions match case-insensitively, so `.JAVA` and `.JaVa`
receive the same prose-link rewriting as `.java`. Generated pages and downloads
preserve the original filename case. Unmapped source files are copied unchanged.

## Java table of contents

For Java files, a table of contents is automatically generated from the source
structure, listing methods, constructors, and fields with their line numbers.
Methods include abstract and native declarations without bodies. Named inner
class members and anonymous inner class members are excluded.

With JavaScript enabled, the current entry follows the linked source line,
regardless of how entries are grouped in the table. A line range uses its first
line. The closest entry at or before that line is highlighted; a target before
all entries highlights the first displayed entry. Without a line fragment, no
entry is highlighted.

Links to code files elsewhere on the site are automatically rewritten to point
to the generated HTML page instead of the raw source file
(see [Link Processing](link-processing.md)).

## Template substitution

Mapped source code files are run through the Lodash template engine before the
code page is rendered and before the downloadable copy is written. Template
holes use the same `<%= %>`, `<% %>`, and `<%- %>` delimiters as the rest of
Tada and have access to `vars` and `site`. This lets authors interpolate site
configuration values directly into their source code, for example a course name
embedded in a header comment. ES template literal syntax such as `${HOME}` is
literal text, so shell, JavaScript, and Kotlin sources that use it render and
download unchanged.

Substitution runs before Java prose link rewriting, so an interpolated value
may contain a Markdown link that is then rewritten to a full URL as usual.
When an extension is not mapped in `extensionToShikiLanguage`, source files are
copied unchanged and no substitution is performed.
