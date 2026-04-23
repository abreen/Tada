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

## Shared Build Internals

The build and watch pipelines share the same source-discovery model.

- `build/source-model.ts` scans `content/` and `public/`, classifies which
  content files are processed, and records output ownership, valid internal
  link targets, and generated route aliases
- `build/source-records.ts` turns individual content or public sources into
  source records containing rendered/copied outputs plus dependency metadata
  such as partial, trace, internal-target, and author relationships

Production builds use that shared scan-and-record layer during full builds, and
watch mode reuses the same layer for incremental planning and recompilation.
