# Build Pipeline

A build runs in five phases:

1. **Setup**: compile templates and initialize the syntax highlighter
2. **Bundle and assets** (parallel): bundle CSS and JavaScript with filenames
   containing the Tada package version, copy fonts, generate favicons and the
   web manifest (if enabled)
3. **Copy**: copy static files from `public/` and non-page assets from
   `content/` into the output directory
4. **Render**: process Markdown, HTML, and code pages into HTML output
5. **Post-build**: run search indexing (if enabled); generate the build
   manifest (production only)

Development builds write to `dist/`. Production builds write to a versioned
subdirectory under `dist-prod/` (see [Production Builds](production-builds.md)).

## Build errors

A build stops when any of these happen. The rules are the same for
`tada dev`, `tada prod`, and `tada watch`.

1. **Config error.** `site.*`, `nav.*`, or `authors.*` is missing (when
   required), exists in more than one format, can't be parsed, or fails
   validation. This includes `logo`, `favicon`, and `fontOverrides` files that
   are missing from `public/` or invalid.
2. **Output conflict.** Two sources would write the same output path. Sources
   are files in `content/` and `public/`, plus the files Tada generates: CSS and
   JavaScript bundles, bundled fonts, `katex/`, `pagefind/`, favicons and
   `manifest.json`, and `_traces/`.
3. **Page error.** A page can't be rendered: invalid or reserved front matter,
   a template, Markdown, or partial error, a broken internal link (in page
   content, `nav`, `authors`, or `parent`), or a failed compile or trace.

Tada prints every error it finds, each once, as one line that starts with the
project-relative path of the file at fault:

```
content/about.md: broken internal link "/x.html"
content/about.md, public/about.html: both write about.html
site.dev.yaml: defaultTimeZone "Mars/Olympus" is not supported
```

## Writing output

A build renders everything in memory before writing anything. Copied files are
referenced by path rather than loaded. A build with errors writes nothing.

When a build succeeds, Tada updates the output directory in place: it writes
new and changed files, deletes files that no longer have a source, and removes
directories left empty. The output directory itself is never renamed or
replaced. A full build compares against what is already on disk, so it also
removes files left over from earlier builds.

Writing is not atomic. While files are being written, a request may see a mix
of old and new files. If writing fails (for example a locked file on Windows,
or a full disk), Tada prints the error and does not try to undo the files it
already wrote. `tada dev` and `tada prod` exit with a failure status; watch mode
rebuilds everything on the next change.

## Shared Build Internals

The build and watch pipelines share the same source-discovery model.

- `build/source-model.ts` scans `content/` and `public/`, classifies which
  content files are processed, and records output ownership, valid internal
  link targets, and generated route aliases. Incremental updates replace dirty
  entries in a shared source inventory and derive indexes once per update
- `build/source-records.ts` turns individual content or public sources into
  source records containing rendered/copied outputs (including generated trace
  files) plus dependency metadata such as partial, trace, internal-target, and
  author relationships. Rendering never reads from or writes to the output
  directory

Production builds use that shared scan-and-record layer during full builds, and
watch mode reuses the same layer for incremental planning and recompilation.

Both modes use the shared output publisher in `build/output-publication.ts`.
Shared validation and source-record helpers do not depend on watch scheduling.
