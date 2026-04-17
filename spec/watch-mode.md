# Watch Mode

Watch mode continuously rebuilds a site while source files change and tells the
browser when it should reload.

Its goals are:

- keep ordinary edits fast
- keep `dist/` correct when files are added, removed, or moved between
  `content/` and `public/`
- report build errors without crashing the watcher
- preserve the last successful site output when a rebuild fails

## Startup

When watch mode starts, it tries to build the site immediately.

- If the initial build succeeds, watch mode starts serving the site and begins
  watching for changes.
- If the initial build fails, watch mode stays running and continues watching
  for changes so the problem can be fixed in place.
- A failed initial build does not publish partial output.

## What Watch Mode Rebuilds

Watch mode treats changes differently depending on what changed.

### Existing content page edit

Editing an existing Markdown or HTML page updates the affected page output.

If a `.java` file changes, all content pages are rebuilt so pages that depend on
trace output stay in sync.

### Existing non-page file edit

Editing an existing file in `public/` updates the corresponding file in
`dist/`.

Editing an existing non-processed file in `content/` updates the corresponding
file in `dist/`.

### Partial edit

Editing, adding, or deleting a partial rebuilds only pages that include that
partial, including transitive includes.

### Config or data change

Changing `site.dev.json` or `nav.json` triggers a full site rebuild.

Changing `authors.json` rebuilds only pages whose `author` front matter depends
on author entries whose data changed.

### Adding a file

Adding a file in `content/` or `public/` rebuilds only outputs affected by that
new source, unless the change also requires a full rebuild for one of the
site-wide cases above.

### Deleting a file

Deleting a file removes the output that came from that source.

Examples:

- deleting `content/about.md` removes `dist/about.html`
- deleting `public/logo.png` removes `dist/logo.png`
- deleting a copied asset in `content/` removes its copied output

If deleting one side of a `content/` versus `public/` conflict changes which
source should own that output path, watch mode updates that output so the
surviving source becomes authoritative immediately without rebuilding
unrelated pages.

### Rename and move behavior

A rename or move is treated as the removal of the old path plus the addition of
the new path.

This means watch mode updates `dist/` so the old output disappears and the new
output appears at its new location.

## Content and Public Conflicts

Watch mode rejects situations where a file in `content/` and a file in
`public/` would produce the same path in `dist/`.

Examples:

- `content/about.md` conflicts with `public/about.html`
- `content/logo.png` conflicts with `public/logo.png`

Conflicts are based on the final output path, not on the source filename alone.

When a conflict is detected:

- the rebuild fails
- watch mode stays running
- the browser is not reloaded with partial output
- the last successful `dist/` remains unchanged

If the conflict is then fixed, watch mode rebuilds and resumes normal reload
behavior.

## Ownership Handoffs

Watch mode supports switching which source tree owns a given output path.

Examples:

- removing `public/about.html` and adding `content/about.md`
- removing `content/logo.png` and adding `public/logo.png`

After a successful rebuild, `dist/` reflects the new owner of that path while
leaving unrelated outputs untouched.

## Failure and Recovery

Watch mode does not exit just because a rebuild fails.

This applies to:

- invalid configuration
- missing required data files
- content errors
- output-path conflicts

After a failed rebuild:

- watch mode keeps running
- the previous successful `dist/` stays available
- fixing the underlying problem triggers another rebuild

Recovery must work both after startup failures and after failures that happen
later while watch mode is already running.

## Browser Reload Behavior

Connected browsers use a WebSocket connection and react to these message types:

- `rebuilding`: the page shows loading feedback
- `reload`: the page reloads

Failed rebuilds do not trigger `reload`.

## Architecture

Watch mode is split into:

- a reusable file-watching engine that batches changes, schedules rebuilds,
  commits staged output updates, and preserves the last successful snapshot
- a Tada adapter that decides which sources need to be rebuilt and how those
  outputs map into `dist/`
