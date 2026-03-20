# Claude guidelines

This codebase is a static site generator written in JavaScript/TypeScript.
The runtime is Bun. Build logic lives in `build/`.

- Site content lives in `content/`
- Markdown & HTML content is processed; other file types are copied into `dist/`
- Lodash HTML templates in `templates/` are internal to the package
- Client-side TypeScript is in `src/`
- Static assets are in `public/`

## CLI commands

- Create a new site: `tada init <dirname>`
- Build development: `tada dev` (uses `site.dev.json`)
- Build production: `tada prod` (uses `site.prod.json`)
- Start dev web server: `tada serve`
- Watch files: `tada watch`
- Clean build artifacts: `tada clean`
- Format code: `bun run format` (for Tada development only)
- Run tests: `bun test`

## Path resolution

`build/utils/paths.js` provides `getPackageDir()` (the Tada package root,
resolved via `__dirname`) and `getProjectDir()` (the user's project, resolved
via `process.cwd()`). When developing Tada itself, both point to the repo root.
When installed as a package, they differ.

## Templates

HTML templates are internal to the Tada package and live in `templates/`:

- `templates/default.html` --- default page layout
- `templates/code.html` --- source code page layout
- `templates/_theme.scss` --- Lodash SCSS template rendered at build time with `themeColor`
- Partials: `_nav.html`, `_top.html`, `_bottom.html`, `_heading.html`, `_author.html`
- Schemas: `nav.schema.json`, `authors.schema.json`

User-facing data files live at the project root:

- `nav.json` --- navigation structure (validated against `templates/nav.schema.json`)
- `authors.json` --- author/staff data (validated against `templates/authors.schema.json`)

Use `<%= page.* %>` to access a page's front matter and `<%= site.* %>` for
values from the active site config.

## Config files

- `site.dev.json` --- development config (`base: http://localhost:8080`, `basePath: /`)
- `site.prod.json` --- production config (real domain and base path)
- `site.title` --- site title, used in the header and to derive `titlePostfix`
- `site.symbol` --- short text (1-5 chars) for the logo and favicon (derives `faviconSymbol`)
- `site.themeColor` --- HSL theme color (derives `faviconColor` if not set)
- Arbitrary template variables live under the `vars` key in the site config JSON

## Client-side components (plus styles)

Each component lives in `src/<name>/` and exports an async `mount()` function
called after page load.

| Component | Directory | Purpose |
|-----------|-----------|---------|
| Anchor headings | `src/anchor/` | Turns headings into links |
| Code pages | `src/code/` | Styles for code pages, copy event handling |
| Header | `src/header/` | Styles and animation for page header |
| Printing | `src/print/` | Printing-specific CSS and JavaScript logic |
| Q&A | `src/question` | Styles and logic for clicking hidden answers to reveal them |
| Search | `src/search/` | Styles and handling for Pagefind-powered search input |
| Time zone chooser | `src/timezone/` | Styles and logic for dynamically updating `<datetime>` elements |
| Table of contents | `src/toc/` | Styles and highlighting logic for TOC |
| Back to top | `src/top/` | Hovering button, appears after scroll |

Global styles: `src/style.scss`, `src/layout.scss`  
Shared styles: `src/_mixins.scss`, imported by some components  
Shared utilities: `src/util.ts` --- includes `applyBasePath()` for prefixing
internal links client-side

Import Sass styles in `src/index.ts` to include them in the bundle.

## Markdown processing

- `build/external-links-plugin.js` --- rewrites external links (uses `site.internalDomains`)
- `build/apply-base-path-plugin.js` --- prefixes internal links and image URLs with `site.basePath`
- Markdown is processed with markdown-it and plugins: anchor, container, deflist, footnote
- Code fences are highlighted at build time using Shiki

## Search index

- When enabled via site config, Pagefind creates a search index after the build
- `src/search/` reads the index client-side and renders results

## PDF processing

- PDFs are copied into `dist/` unchanged
- When search is enabled via site config, text from reachable PDFs is indexed by Pagefind

## Code page generation

- When enabled via site config, a special HTML page is generated for Java source files
- A syntax tree is built from the Java source to generate a table of contents
- Method line numbers are embedded in HTML for Pagefind to index
- Syntax highlighting is done at build time using Shiki (`build/utils/shiki-highlighter.js`)
