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
- Typecheck: `bun run typecheck` (runs `tsc --noEmit`)
- Run tests: `CLAUDECODE=1 bun test`
- Run a single test: `CLAUDECODE=1 bun test build/code.test.ts`

You should use the `CLAUDECODE` env var with `bun test` to reduce output tokens.

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
- Pre-commit hook runs `bunx lint-staged && bun run lint && bun run typecheck`
- Run `bun run format` to format the entire codebase manually

## Logging

Set `TADA_LOG_LEVEL` to control build log verbosity. Valid levels (most to least
verbose): `debug`, `info`, `warn`, `error`. Default is `info`.

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

## Build pipeline

The build (`build/pipeline.ts`) runs in phases:

1. **Setup**: compile templates, initialize Shiki highlighter
2. **Bundle + assets** (parallel): Bun-bundled CSS/JS, font generation, favicons, manifest
3. **Copy**: public/ files and non-processed content assets into `dist/`
4. **Render**: process Markdown, HTML, and code pages into `dist/`
5. **Post-build**: Pagefind search indexing (if enabled)

Watch mode (`build/watch.ts`) uses Chokidar with 300 ms debounce and a WebSocket
server on port 35729 for live reload. Incremental rebuilds are scoped by change
category: `content | public | src | templates | config`.

## Critical CSS

To avoid render-blocking CSS, the build produces two CSS bundles:

- `critical.bundle.css` --- inlined into every HTML page as a `<style>` tag
- `index.bundle.css` --- loaded asynchronously via `media="print" onload`

Critical CSS (`src/critical.scss`) imports shared Sass partials rather than
duplicating rules:

- `src/_base.scss` --- core element styles (body, headings, links, code, `:root` vars)
- `src/_layout.scss` --- page layout and responsive media queries
- `src/header/_base.scss` --- header bar positioning, logo, site title

These partials are also `@use`d by `src/style.scss` and `src/header/style.scss`,
so the rules are defined once and shared between both bundles. The full
stylesheet intentionally re-includes the critical rules so it is self-contained
and cacheable across page navigations.

When adding new styles, decide whether they affect first-paint layout or
appearance. If so, put them in the appropriate partial (not in `critical.scss`
directly). Otherwise, add them to `style.scss` or a component stylesheet.

## Client-side components

Each component lives in `src/<name>/` with an `index.ts` (exporting async
`mount()`) and `style.scss`. Import Sass styles in `src/index.ts` to include
them in the bundle. Shared utilities are in `src/util.ts`.

## Content front matter

Each file in `content/` starts with YAML front matter. Key fields:

- `title` (required) --- page title for `<title>` and page heading
- `skip` --- set to `true` to skip building the page
- `author` --- author handle resolved via `authors.json`
- `description` --- meta description
- `toc` --- set to `true` to show a table of contents
- `parent` / `parentLabel` --- URL and label for a breadcrumb link above the title
- `published` --- date of publishing (e.g., `2025-09-09`)

Arbitrary fields are also accessible in templates via `<%= page.fieldName %>`.

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
