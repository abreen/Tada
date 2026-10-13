# Project Structure

A Tada site has this layout:

```
site.dev.yaml         Development config
site.prod.yaml        Production config
nav.yaml              Navigation links (optional)
authors.yaml          Author metadata (optional)
content/              Pages and assets
  index.md            Home page (required)
  ...
public/               Static files copied to output as-is
src/                  Scripts and styles compiled with the site (optional)
package.json          Lists @abreen/tada for editor types, and packages (optional)
tsconfig.json         TypeScript settings for src/ (optional)
```

The `content/` directory contains pages (Markdown, HTML, or source code files)
and assets (images, PDFs, etc.). Processed files become HTML pages; everything
else is copied unchanged. The `public/` directory is also copied to the output
root. The optional `src/` directory holds the site's own TypeScript,
JavaScript, and Sass. Pages list scripts from it in front matter, and Tada
compiles them into `_scripts/`; nothing in `src/` is copied as-is (see
[Author Scripts](author-scripts.md)). Config values and scripts can also name
files in packages installed in `node_modules` with `npm:` paths; only those
files are published (see [Packages](packages.md)). If two sources would produce the same
output path, the build stops with an
output conflict (see [Build errors](build-pipeline.md#build-errors)). This
includes two content pages (such as `about.md` and `about.html`), a code page
and an HTML page (`demo.py` and `demo.py.html`), content and public files with
the same path, and files that collide with output Tada generates itself.

The output directory is `dist/` for development builds.

Within the Tada package itself, watch mode lives in `build/watch/` and shares
the build source pipeline:

- `build/source-model.ts` for scanning project files and tracking source-to-
  output ownership, valid link targets, and processed content classification
- `build/source-records.ts` for rendering or copying one source into concrete
  outputs plus dependency metadata consumed by builds and watch snapshots
- `build/site-build.ts` for the build core shared by `tada dev`, `tada prod`,
  and watch mode

Writing build output to disk lives in `build/output-publication.ts`. The
watcher engine only schedules builds and owns its subscriptions and timers.
