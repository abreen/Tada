# Site Banner

The optional `banner` site configuration field displays a message above the
page layout on every default, code, and literate page. Its value is a Markdown
string rendered at build time with Tada's normal Markdown extensions and shown
in a bordered box without a fixed title or icon.

Use a YAML block scalar for multiline content:

```yaml
banner: |
  The semester is now closed. Final grades will become available on
  [Gradescope](https://example.org/course/12345) on December 30.

  This site is an archive. This is how the site appeared on December 27, 2020.
```

An omitted or empty `banner` does not render an alert. The banner is excluded
from Pagefind indexing so the same site-wide message does not appear as a
result for every page. Root-relative links are prefixed with the configured
`basePath`; relative links resolve from each generated page.

The banner is part of the generated HTML and remains visible when client-side
JavaScript is disabled. Like page Markdown, banner Markdown may contain raw
HTML because site-author content is trusted.
