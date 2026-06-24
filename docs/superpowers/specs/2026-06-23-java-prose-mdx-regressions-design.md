# Java Prose MDX Regression Fixes

## Scope

Fix three reviewed regressions in Java prose rendering without changing raw
`<script>` serialization or legacy fence detection:

- Literate Java extraction must tolerate TeX braces that MDX would otherwise
  parse as JavaScript expressions.
- Java `///` expression results must render as values, not as newly authored
  Markdown syntax.
- Java `///` partials must resolve beside the Java source and register their
  watch dependency.

## Design

Literate Java will parse a math-protected copy of its MDX content only for code
fence discovery. It will continue returning the original content so the normal
MDX renderer owns final KaTeX output.

Code pages will split responsibilities between raw and transformed source. The
raw source goes to `renderCodeWithComments`, allowing `{site.*}` and `{vars.*}`
to be evaluated once by MDX. The transformed source remains the downloadable
Java asset, where structured expressions are intentionally substituted into
`///` comments.

`renderCodeWithComments` will receive the real Java source path and dependency
collector. It will pass both to `renderMdx`, giving `<Partial>` the correct base
directory and preserving watch invalidation.

## Testing

Add focused regressions for TeX braces in literate Java, Markdown-significant
expression values in Java prose, and adjacent Java-prose partial resolution and
dependency collection. Run the focused unit files, then the full unit,
Playwright, and functional suites.
