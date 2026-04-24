# Project Structure

A Tada site has this layout:

```
site.dev.yaml         Development config
site.prod.yaml        Production config
nav.yaml              Navigation links
authors.yaml          Author metadata
content/              Pages and assets
  index.md            Home page (required)
  ...
public/               Static files copied to output as-is
```

The `content/` directory contains pages (Markdown, HTML, or source code files)
and assets (images, PDFs, etc.). Processed files become HTML pages; everything
else is copied unchanged. The `public/` directory is also copied to the output
root. If a file in `content/` and a file in `public/` would produce the same
output path, the build fails.

The output directory is `dist/` for development builds.

Within the Tada package itself, the shared build/watch source pipeline is split
between:

- `build/source-model.ts` for scanning project files and tracking source-to-
  output ownership, valid link targets, and processed content classification
- `build/source-records.ts` for rendering or copying one source into concrete
  outputs plus dependency metadata consumed by builds and watch snapshots
