# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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
- Clean build artifacts: `tada clean` (use `--all` to also remove font cache)
- Format code: `bun run format` (for Tada development only)
- Lint: `bun run lint`
- Run tests: `bun test`

## Testing locally

This repository is the Tada **package**, not a Tada site. Do not run `tada dev`
or `tada prod` in this directory — there is no site here. To test:

1. `bun run init-example --default`
2. `cd example`
3. `../bin/tada.js dev` (or `prod`, `serve`, etc.)

The `content/` directory in this repo is the default content copied into new
projects by `tada init` — it is not a buildable site on its own.

## Formatting

- Prettier: trailing commas, single quotes, no parens on single arrow params
- Pre-commit hook (`bunx lint-staged`) auto-formats staged TS/JS/SCSS/JSON files
- Run `bun run format` to format the entire codebase manually

## Caching

- WOFF2 fonts are cached in `.font-cache/` in the project directory
- Cache uses SHA-256 content hashing of source TTFs for invalidation
- `tada clean` preserves the cache; `tada clean --all` removes it

## Path resolution

`build/utils/paths.js` provides `getPackageDir()` (the Tada package root,
resolved via `__dirname`) and `getProjectDir()` (the user's project, resolved
via `process.cwd()`). When developing Tada itself, both point to the repo root.
When installed as a package, they differ.

## Templates

Lodash HTML templates and partials live in `templates/` (internal to the package).
User-facing data files (`nav.json`, `authors.json`) live at the project root and
are validated against JSON schemas in `templates/`.

Use `<%= page.* %>` to access a page's front matter and `<%= site.* %>` for
values from the active site config.

## Config files

- `site.dev.json` --- development config (`base: http://localhost:8080`, `basePath: /`)
- `site.prod.json` --- production config (real domain and base path)
- `site.title` --- site title, used in the header and to derive `titlePostfix`
- `site.symbol` --- short text (1-5 chars) for the logo and favicon (derives `faviconSymbol`)
- `site.themeColor` --- HSL theme color (derives `faviconColor` if not set)
- Arbitrary template variables live under the `vars` key in the site config JSON

## Client-side components

Each component lives in `src/<name>/` with an `index.ts` (exporting async
`mount()`) and `style.scss`. Import Sass styles in `src/index.ts` to include
them in the bundle. Shared utilities are in `src/util.ts`.

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
