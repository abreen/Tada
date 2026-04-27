# Watch Mode

Watch mode continuously rebuilds a site while source files change and tells the
browser when it should reload.

Its goals are:

- keep ordinary edits fast
- keep `dist/` correct when files are added, removed, or moved between
  `content/` and `public/`
- report build errors without crashing the watcher
- preserve the last successful site output when a rebuild fails

## Definition of Terms

Watch mode uses these source kinds:

- A **page source** is a file in `content/` that Tada renders into a page.
  This includes Markdown files, HTML files, literate Java files, and files whose
  extension is listed in `extensionToShikiLanguage`.
- A **content asset source** is a file in `content/` that Tada copies to
  `dist/` instead of rendering as a page.
- A **partial source** is like a page source, but is never rendered into a page;
  instead, page sources include them. Their file names start with `_`.
- A **skipped content source** is a Markdown or HTML file in `content/` whose
  front matter has `skip: true`. Skipped content sources do not produce output,
  even though Markdown and HTML files are normally page sources.
- A **public source** is a file in `public/`. Public sources are copied to the
  same relative path in `dist/`.
- A **trace source** is a `.java` or `.py` file used by a page source's trace
  output.
- A **config source** is one of these config files in the site root:
  `site.dev.yaml`, `site.dev.yml`, `site.dev.json`, `nav.yaml`, `nav.yml`,
  `nav.json`, `authors.yaml`, `authors.yml`, or `authors.json`.

## Startup

When watch mode starts, it tries to build the site immediately.

- If the initial build succeeds, watch mode starts serving the site and begins
  watching for changes.
- If the initial build fails, watch mode stays running and continues watching
  for changes so the problem can be fixed in place.
- A failed initial build does not publish incomplete output.

## What Watch Mode Rebuilds

Watch mode treats changes differently depending on what changed.

### Existing page source edit

Editing an existing page source updates that page source's output in `dist/`.

### Existing public source edit

Editing an existing public source updates the corresponding file in `dist/`.

### Existing content asset source edit

Editing an existing content asset source updates the corresponding file in
`dist/`.

### Existing trace source edit

Editing an existing trace source rebuilds the changed trace output and any page
sources that depend on it.

### Partial edit

Editing, adding, or deleting a partial source rebuilds only page sources that
include that partial source, including transitive includes.

### Skipped content source edit

Editing, adding, or deleting a source that is skipped does not update `dist/`.
However:

- If `skip: true` is added to an existing page source, its output is deleted
- If `skip: true` is removed from a skipped source, it becomes a page source

### Config source change

Changing a `site.dev.*` or `nav.*` config source triggers a full site rebuild.

Editing an `authors.*` config source rebuilds only page sources whose `author`
front matter depends on author entries whose data changed. But adding or
deleting an `authors.*` config source triggers a full rebuild.

### Adding a file

Adding a page source, content asset source, partial source, or public source
rebuilds only outputs affected by that new source, unless the change also
requires a full rebuild for one of the site-wide cases above.

### Deleting a file

Deleting a page source, content asset source, or public source removes the
output that came from that source. Deleting a partial source rebuilds page
sources that included it.

Examples:

- deleting `content/about.md` removes `dist/about.html`
- deleting `public/logo.png` removes `dist/logo.png`
- deleting a content asset source removes its copied output

If two sources conflict and the user deletes one of them, the remaining source
writes that `dist/` path. For example, if `content/about.md` and
`public/about.html` conflict, deleting `public/about.html` writes
`dist/about.html` from `content/about.md`. Unrelated outputs are not rebuilt.

### Rename and move behavior

A rename or move is treated as the removal of the old path plus the addition of
the new path.

This means watch mode updates `dist/` so the old output disappears and the new
output appears at its new location.

After a directory rename, watch mode continues tracking the renamed directory.
If the rename temporarily breaks links and the next rebuild fails, fixing those
links recovers the build and files added later under the renamed directory still
trigger rebuilds.

## Output Path Conflicts

Watch mode rejects situations where a page source or content asset source and a
public source would produce the same path in `dist/`.

Examples:

- `content/about.md` conflicts with `public/about.html`
- `content/logo.png` conflicts with `public/logo.png`

## Failure and Recovery

Watch mode does not exit just because a rebuild fails.

This applies to:

- invalid config sources
- missing required config sources
- page source errors
- output-path conflicts

After a failed rebuild:

- watch mode keeps running
- the previous successful `dist/` stays available
- the failed source changes are retried with the next source change
- fixing the underlying problem triggers another rebuild

## Browser Reload Behavior

Connected browsers use a same-origin WebSocket connection to `/__tada_watch` and
react to these message types:

- `rebuilding`: the page shows loading feedback
- `reload`: the page reloads

Failed rebuilds do not trigger `reload`.

Every successful rebuild after watch startup triggers `reload`, even if the
rebuilt `dist/` bytes are unchanged.
