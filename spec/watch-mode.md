# Watch Mode

Watch mode monitors the file system for changes and performs incremental rebuilds
with live reload.

Changes are debounced (300 ms) and classified into categories: content, public
files, and config. The rebuild scope depends on the category:

- **Content change** -- only the affected pages are re-rendered
- **Public file change** -- only the changed file is copied
- **Config or data file change** -- full restart (site config, `nav.json`,
  `authors.json`)

A WebSocket server sends reload messages to connected browsers after each
rebuild. If a build fails, an error message is sent instead. A client-side script
(included only in development builds) listens for these messages and reloads the
page.

Watch mode also starts a development web server.
