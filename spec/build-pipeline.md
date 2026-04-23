# Build Pipeline

A build runs in five phases:

1. **Setup**: compile templates and initialize the syntax highlighter
2. **Bundle and assets** (parallel): bundle CSS and JavaScript, copy fonts,
   generate favicons and the web manifest (if enabled)
3. **Copy**: copy static files from `public/` and non-page assets from
   `content/` into the output directory
4. **Render**: process Markdown, HTML, and code pages into HTML output
5. **Post-build**: run search indexing (if enabled); generate the build
   manifest (production only)

Development builds write to `dist/`. Production builds write to a versioned
subdirectory under `dist-prod/` (see [Production Builds](production-builds.md)).

Full builds stage output in a temporary directory and publish it only after all
phases succeed. If a build fails, it does not publish partial output:

- if there was no previous build output, no new output directory is published
- if a previous build output exists, it remains unchanged
