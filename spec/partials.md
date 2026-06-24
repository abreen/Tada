# Partials

Files whose basename starts with `_` are reusable MDX fragments and are not
emitted as standalone pages. Include one with the static `Partial` component:

```mdx
<Partial source="_problem1.md" />
<Partial source="subdir/_problem2.mdx" />
```

The source must end in `.md`, `.markdown`, or `.mdx`; HTML partials are not
supported. Paths resolve relative to the file containing the component, so a
nested partial resolves its own includes from its own directory.

Partials have no front matter. They receive the including page's immutable
`page`, `site`, and `vars` scope and may use all built-in components.

Tada records every direct and transitive partial as a watch dependency. Cycles
are rejected, and nesting is limited to 10 partials.
