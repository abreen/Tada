# Code Pages

Source code files in the content directory are rendered as browsable,
syntax-highlighted HTML pages when their extension is configured in
`extensionToShikiLanguage`. If that field is omitted or empty, Tada does not
generate code pages for source files.

Extension keys are literal configuration entries, including names such as
`__proto__` and `constructor`; these can be mapped like any other extension.

Extension keys and source-file extensions match case-insensitively. For example,
`TS: typescript` renders `Sample.tS` using the TypeScript language, while preserving
the source filename in the generated page and download. If multiple keys differ
only by case, an exact lowercase key takes precedence; otherwise the last
configured key is used. Language identifiers are used unchanged. The original
mapping remains available to templates as `site.extensionToShikiLanguage`.

Each code page includes:

- Full syntax-highlighted source
- Line numbers linked as anchors
- A download button for the original file

Downloads use native links without JavaScript and in cross-origin embedded
pages. When the File System Access save picker is available in a top-level or
same-origin embedded page, it lets visitors choose where to save the source.
Cancelling the picker leaves the page unchanged and starts no native download.

## Markdown documentation comments

Java files that use Markdown documentation comments (`///`, introduced in Java
25) receive special treatment. Consecutive `///` lines are extracted, rendered as
Markdown, and displayed inline between the surrounding code segments. The
rendered prose preserves the indentation level of the original comments. These
comments support the same build-time KaTeX math syntax as Markdown pages, so
authors can write inline math such as `$E = mc^2$` and display math with `$$`.

When a user copies a section that includes rendered prose, the original `///`
comment lines are restored in the clipboard so that pasted text is valid Java
source. Markdown links in these comment lines are rewritten to full URLs
(using `base` + `basePath`) so they resolve when the source is viewed outside
the site. The same rewriting is applied to the downloaded copy of the source
file. Java filename extensions match case-insensitively, so `.JAVA` and `.JaVa`
receive the same prose-link rewriting as `.java`. Generated pages and downloads
preserve the original filename case. Unmapped source files are copied unchanged.

This rewriting also applies to code pages directly in the content root; their
relative prose links resolve from the site root before the base path is added.

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
