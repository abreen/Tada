# CSS Strategy

The build produces two CSS bundles to optimize rendering performance:

- **Critical CSS** -- inlined as a `<style>` tag in every page's `<head>`.
  Contains core element styles, page layout, and header positioning so the page
  renders without waiting for an external stylesheet.

- **Full CSS** -- loaded asynchronously after the page renders. Contains the
  complete stylesheet, intentionally re-including the critical rules so it is
  self-contained and cacheable across page navigations.

Shared style rules are defined once in common partials and imported by both
bundles, avoiding duplication in the source.

JavaScript is bundled and loaded with deferred execution.
