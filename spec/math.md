# Math (LaTeX)

LaTeX math expressions are rendered at build time using KaTeX via the
`@vscode/markdown-it-katex` markdown-it plugin. No client-side JavaScript is
needed for math rendering.


## Syntax

Inline math uses single dollar delimiters: `$E = mc^2$`.

Display math uses double dollar delimiters:

```markdown
$$\int_0^\infty e^{-x^2} dx = \frac{\sqrt{\pi}}{2}$$
```

Dollar signs that don't form valid math delimiters (e.g., `$5`) are left as
plain text.


## Error handling

Invalid LaTeX syntax causes the build to fail. The `@vscode/markdown-it-katex`
plugin's built-in renderers swallow KaTeX parse errors, so Tada overrides the
renderer rules with direct `katex.renderToString()` calls that let
`katex.ParseError` propagate.


## Stylesheet

The KaTeX stylesheet (`katex.min.css`) is compiled from KaTeX's SCSS source
with only woff2 font references enabled (`$use-woff: false`, `$use-ttf: false`).
The compiled CSS and woff2 font files are copied to `dist/katex/` during the
build's asset phase.

The stylesheet is included conditionally: only pages whose rendered HTML
contains `class="katex"` get a deferred `<link>` tag. The deferred loading
uses the `media="print" onload="this.media='all'"` pattern (same as the main
stylesheet) with a `<noscript>` fallback.
