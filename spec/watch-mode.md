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

Output paths can also change between a file and a directory in either
direction. Publication removes obsolete files and prunes their empty parent
directories before writing replacements. Unrelated directory contents are never
removed to make a replacement fit.

There is a known Chokidar polling limitation when the same path rapidly changes
from a directory to a file and back to a directory: child subscriptions can be
missed. Restart watch mode if subsequent edits under that recreated directory
are not detected. Output publication supports both transition directions; it
cannot compensate for source events the watching backend does not deliver.

After a directory rename, watch mode continues tracking the renamed directory.
If the rename temporarily breaks links and the next rebuild fails, fixing those
links recovers the build and files added later under the renamed directory still
trigger rebuilds.

## Output Path Conflicts

Watch mode rejects any two sources that would produce the same path in `dist/`,
including collisions between content sources and between content and public
sources. It reports the source paths and shared output path before publishing
changes. Removing either conflicting source recovers using the surviving source;
incremental scans retain every source's output ownership during the conflict.

Examples:

- `content/about.md` conflicts with `content/about.html`
- `content/demo.py` conflicts with `content/demo.py.html` when Python is configured
- `content/Demo.java.md` conflicts with `content/Demo.java` for the raw download
- `content/about.md` conflicts with `public/about.html`
- `content/logo.png` conflicts with `public/logo.png`

## Failure and Recovery

Watch mode does not exit just because a rebuild fails.

This applies to:

- invalid config sources
- missing required config sources
- page source errors
- output-path conflicts
- failures while publishing output files

After a failed rebuild:

- watch mode keeps running
- the previous successful `dist/` stays available
- the failed source changes are retried with the next source change
- fixing the underlying problem triggers another rebuild

Incremental publication stages new files and journals replaced or deleted files.
If publication fails, it restores those originals and removes newly created
files and directories. A publication failure discards the compiler snapshot;
the next source change retries the accumulated failed changes with a full build.
No success notification or browser reload is sent for the failed publication,
including a failure during startup. If the filesystem also prevents rollback,
the error identifies the retained recovery directory containing any unrestored
originals.

## Browser Reload Behavior

Connected browsers use a same-origin WebSocket connection to `/__tada_watch` and
react to these message types:

- `rebuilding`: the page shows loading feedback
- `reload`: the page reloads

Failed rebuilds do not trigger `reload`.

Every successful rebuild after watch startup triggers `reload`, even if the
rebuilt `dist/` bytes are unchanged.

## Internal Lifecycle and State

The scheduler receives deduplicated absolute dirty paths and serializes build
callbacks. Directory notifications reconcile the affected subtree, and a polling
file subscription that becomes a directory is registered recursively. The Tada compiler owns its committed snapshot and output publication;
only a successful publication advances that snapshot. Source classification and
predicted outputs live in one source inventory, with derived producer and target
indexes. Rendered records and dependency indexes remain separate from predicted
outputs. Planning uses these values without loading configuration or reading the
filesystem itself.

Build failures remain recoverable on a subsequent source change. Watcher errors
and rejected lifecycle callbacks terminate the session after cleanup. The
internal close operation is idempotent: it clears pending timers and work, closes
subscriptions, and waits for active compilation/publication to finish without
sending a subsequent reload. The CLI wrapper closes its HTTP server when the
scheduler terminates. This does not change signal handling or background search
indexing behavior.
