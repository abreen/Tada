# Production Builds

Production builds are versioned. Each build writes to `dist-prod/v{N}/` where N
is automatically incremented. A build manifest (`tada.manifest.json`) is written
inside each version directory, recording the schema version, build number, build
time, and a SHA-256 hash of every output file (excluding the search index
directory and the manifest itself).

Version numbers are assigned only to successful builds. If a production build
fails, it does not publish a new version directory.

Production builds differ from development builds in several ways:

- Output goes to a versioned directory instead of `dist/`
- The live-reload client script is excluded
- Favicons are typically enabled (but controlled by the `favicon` feature flag)
- Source maps are omitted
- A build manifest is written
