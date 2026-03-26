# Watch Mode

Watch mode monitors the file system for changes and performs incremental rebuilds
with live reload.

Changes are debounced (300 ms) and classified into categories: content, public
files, and config. The rebuild scope depends on the category:

- **Content change** -- only the affected pages are re-rendered
- **Public file change** -- only the changed file is copied
- **Config or data file change** -- full restart (site config, `nav.json`,
  `authors.json`)

Watch mode also starts a development web server, but only after the first
successful build.

## Client-side reload script

The reload script lives in `build/watch-reload-client.ts`. It is bundled
separately and included as an asset only in watch mode.

The script opens a WebSocket connection to `ws://localhost:<port>` (the port is
chosen at bundle time via `__WEBSOCKET_PORT__`. It handles two message types:

- **`rebuilding`** -- adds a shimmer animation to the page header and sets a
  `wait` cursor on the body, giving visual feedback that a rebuild is in
  progress
- **`reload`** -- calls `window.location.reload()` to refresh the page with the
  new build output

The server also sends `error` when a build fails and `ready` when the watcher is
initialized (used only by functional tests).
