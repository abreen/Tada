# CLAUDE.md

This codebase is a static site generator written in TypeScript and uses Bun.

- Build logic lives in `build/`
- Site content lives in `content/`
- Markdown & HTML content is processed; other file types are copied unchanged
- Lodash HTML templates in `templates/` are internal to the package
- Client-side code is in `src/`
- Static assets are in `public/`

## Spec

High-level feature specs live in `spec/`. Read them for design context.

## CLI commands

- Create a new site: `tada init <dirname>`
- Build development: `tada dev` (uses `site.dev.json`)
- Build production: `tada prod` (uses `site.prod.json`)
- Start dev web server: `tada serve`
- Watch files: `tada watch`
- Clean build artifacts: `tada clean`
- Format code: `bun run format` (for Tada development only)
- Lint: `bun run lint`
- Typecheck: `bun run typecheck` (runs `tsc --noEmit`)
- Run unit tests: `bun test`
- Run a single unit test: `bun test build/code.test.ts`
- Run functional tests: `bun run test:functional`
- Do NOT run pytest directly, just use the scripts above

Functional tests are black-box Python/pytest tests in `functional_tests/` that
exercise the CLI end-to-end (init, dev, prod, watch, clean). They use
`subprocess` to run Tada and assert on exit codes, stdout, and file system state.
Watch mode tests are slow (~10s each) due to polling for rebuilds.

## Testing locally

This repository is the Tada **package**, not a Tada site. Do not run `tada dev`
or `tada prod` in this directory — there is no site here. To test:

1. `bun run init-example`
2. `cd example`
3. `../bin/tada.js dev` (or `prod`, `serve`, etc.)

The `content/` directory in this repo is the default content copied into new
projects by `tada init` — it is not a buildable site on its own.

## Formatting

The pre-commit hook runs Prettier. Do not run any commands to format code.

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
