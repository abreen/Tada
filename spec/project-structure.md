# Project Structure

A Tada site has this layout:

```
site.dev.json         Development config
site.prod.json        Production config
nav.json              Navigation links
authors.json          Author metadata
content/              Pages and assets
  index.md            Home page (required)
  ...
public/               Static files copied to output as-is
```

The `content/` directory contains pages (Markdown, HTML, or source code files)
and assets (images, PDFs, etc.). Processed files become HTML pages; everything
else is copied unchanged. The `public/` directory is also copied to the output
root. If a file exists in both `content/` and `public/`, the build fails.

The output directory is `dist/` for development builds.
