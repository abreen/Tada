# Migrating to Tada 2

Tada 2 intentionally breaks authored syntax from Tada 1. There is no automatic
codemod.

| Tada 1 | Tada 2 |
| --- | --- |
| `!!! note` / `!!! warning` | `<Note>` / `<Warning>` |
| `??? question` | `<Question>` or `<MultipleChoice>` |
| `<<< details` | `<Details>` |
| `::: section` | `<Section>` |
| three `+++` fences | `<Columns>` with two `<Column>` children |
| `{{{ _partial.md }}}` | `<Partial source="_partial.md" />` |
| `slides: true` and `---` separators | `<Slides>` and `<Slide>` |
| heading `# Subtitle` suffix | `<Subtitle>` in the heading |
| `renderTrace(...)` | `<Trace ... />` |
| `renderTimeZoneChooser()` | `<TimeZoneChooser />` |
| `<%= page.x %>` in Markdown | `{page.x}` |
| triple-hyphen HTML comments | `{/* native MDX comment */}` |
| delimiterless Presto front matter | YAML wrapped in `---` delimiter lines |

Front matter, nav, and authors files use quoted `{site.path}` and `{vars.path}`
expressions. A whole-value expression preserves arrays, objects, booleans, and
numbers. Site config files define these values and are not interpolated.

HTML page bodies and ordinary source files are literal. Java `///` Markdown
prose comments are the only source comments that receive `site` and `vars`.
Literate Java no longer has hidden code fences; every Java fence is visible and
included in the generated source.
