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

Before starting watch mode, the CLI requires exactly one development site
configuration file: `site.dev.yaml`, `site.dev.yml`, or `site.dev.json`. If it
is missing or multiple variants exist, the command exits before watching;
correct the files and restart `tada watch`.

Once this precondition is met, watch mode subscribes to its source directories
and configuration files, then waits for the initial watcher scans to finish
before attempting the first build. Changes observed during watcher readiness or
the initial build are buffered and rebuilt afterward.

- If the initial build succeeds, watch mode starts serving the site and continues
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

Inbound code links are updated when their target changes between a generated
code page and a raw source download, including moves between `content/` and
`public/` and handoffs between regular Java and literate Java sources. This also applies when both
output paths remain valid. Anchors with `download` keep their raw file target.

An output path can change between a file and a directory. Tada deletes the old
output before writing the new one.

Watch mode watches `content/` and `public/` by polling. A known limitation:
if a directory is replaced by a file and then by a directory again in quick
succession, edits inside the recreated directory may not be detected. Restart
watch mode if that happens.

## Output Path Conflicts

Output conflicts stop the build like any other build error (see
[Build errors](build-pipeline.md#build-errors)). Deleting or renaming either
conflicting source fixes the conflict, and the next build writes the output
from the remaining source.

Examples:

- `content/about.md` conflicts with `content/about.html`
- `content/demo.py` conflicts with `content/demo.py.html` when Python is configured
- `content/Demo.java.md` conflicts with `content/Demo.java` for the raw download
- `content/about.md` conflicts with `public/about.html`
- `public/manifest.json` conflicts with the generated web app manifest when
  favicons are enabled

## Failure and Recovery

Watch mode keeps running when a build fails. After a build error:

- nothing in `dist/` changes, and the server keeps serving the last successful
  output
- connected browsers are not reloaded
- the next change rebuilds the files from the failed attempt together with the
  new change

After a write failure, the next change triggers a full rebuild. If the initial
build fails, watch mode keeps watching and starts the server after the first
successful build.

An error in the file watcher itself ends watch mode.

## Browser Reload Behavior

Connected browsers use a same-origin WebSocket connection to `/__tada_watch` and
react to these message types:

- `rebuilding`: the page shows loading feedback
- `reload`: the page reloads

Failed rebuilds do not trigger `reload`.

Every successful rebuild after watch startup triggers `reload`, even if the
rebuilt `dist/` bytes are unchanged.

## Internal Lifecycle and State

The watcher collects changed paths and runs one build at a time. Each build
rescans `content/` and `public/` to get the current list of sources, then
re-renders changed sources and the pages that depend on them through partials,
traces, authors, or internal link targets. Configuration and file contents are
read by the build, not by the watcher. Closing watch mode waits for the current
build to finish and does not send a reload.
