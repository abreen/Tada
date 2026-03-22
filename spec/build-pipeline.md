# Build Pipeline

A build runs in five phases:

1. **Setup** -- compile templates and initialize the syntax highlighter
2. **Bundle and assets** (parallel) -- bundle CSS and JavaScript, copy fonts,
   generate favicons and the web manifest (if enabled)
3. **Copy** -- copy static files from `public/` and non-page assets from
   `content/` into the output directory
4. **Render** -- process Markdown, HTML, and code pages into HTML output
5. **Post-build** -- run search indexing (if enabled); generate the build
   manifest (production only)

Development builds write to `dist/`. Production builds write to a versioned
subdirectory under `dist-prod/` (see [Production Builds](production-builds.md)).
