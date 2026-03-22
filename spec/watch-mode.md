# Watch Mode

Watch mode monitors the file system for changes and performs incremental rebuilds
with live reload.

Changes are debounced (300 ms) and classified into categories: content, public
files, client-side source, templates/data, and config. The rebuild scope depends
on the category:

- **Content change** -- only the affected pages are re-rendered
- **Public file change** -- only the changed file is copied
- **Source change** -- CSS/JS bundles are rebuilt and all content is re-rendered
  (since asset filenames may change)
- **Template or data change** -- templates are recompiled and affected content is
  re-rendered; structural changes trigger a full restart
- **Config change** -- full restart

A WebSocket server sends reload messages to connected browsers after each
rebuild. A client-side script (included only in development builds) listens for
these messages and reloads the page.

Watch mode also starts a development web server.
