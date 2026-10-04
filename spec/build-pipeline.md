# Build Pipeline

A build runs in five phases. The first three happen in memory; nothing is
written until all of them succeed.

1. **Setup**: validate configuration, compile templates, and initialize the
   syntax highlighter
2. **Generate**: bundle CSS and JavaScript with filenames containing the Tada
   package version, compile the KaTeX stylesheet, generate favicons and the web
   manifest (if enabled), and reference the bundled fonts
3. **Render**: turn every source into outputs: Markdown, HTML, and code pages
   become HTML, and other files in `content/` and `public/` are referenced for
   copying
4. **Write**: update the output directory in place (see
   [Writing output](#writing-output))
5. **Post-build**: run search indexing (if enabled); write the build manifest
   (production only)

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

When a build succeeds, Tada updates the output directory in place. A full
build writes every output, deletes every other file and empty directory
already on disk (except the search index while search is enabled), and so also
removes anything left over from earlier builds. An incremental watch build
writes only new and changed files and deletes outputs that no longer have a
source. Directories left empty are removed. The output directory itself is
never renamed or replaced, and nothing is written or deleted through a
symbolic link inside it.

Writing is not atomic. While files are being written, a request may see a mix
of old and new files. If writing fails (for example a locked file on Windows,
or a full disk), Tada prints the error and does not try to undo the files it
already wrote. `tada dev` and `tada prod` exit with a failure status; watch mode
rebuilds everything on the next change.

## Shared Build Internals

`tada dev`, `tada prod`, and watch mode share one build core.

- `build/source-model.ts` scans `content/` and `public/`, classifies which
  content files are processed, and records output ownership, valid internal
  link targets, and generated route aliases. Watch mode rescans on every build
- `build/source-records.ts` turns individual content or public sources into
  source records containing rendered/copied outputs (including generated trace
  files) plus dependency metadata such as partial, trace, internal-target, and
  author relationships. Rendering never reads from or writes to the output
  directory
- `build/site-assets.ts` produces the files Tada generates itself
- `build/site-build.ts` renders every source, validates the result, and
  assembles a snapshot of all outputs. Watch mode keeps that snapshot to
  re-render only what changed
- `build/output-publication.ts` writes a snapshot's outputs into the output
  directory in place
