# Production Builds

Production builds are versioned. Each build writes to `dist-prod/v{N}/`, where
N is one more than the highest existing version. A build manifest
(`tada.manifest.json`) records the schema version, build number, build time,
and a SHA-256 hash of every output file (excluding the search index directory
and the manifest itself).

The manifest is written last. A `v{N}` directory counts as a build only if it
contains `tada.manifest.json`; version numbering, `tada diff`, and
`tada clean --prod` ignore directories without one. If a production build
fails, Tada removes its `v{N}` directory. If that removal fails, the leftover
directory has no manifest, so it is ignored, and the next build replaces it.

Production builds differ from development builds in several ways:

- Output goes to a versioned directory instead of `dist/`
- The live-reload client script is excluded
- Favicons are typically enabled (but controlled by the `favicon` feature flag)
- Source maps are omitted
- A build manifest is written
