# CLAUDE.md

This codebase is a static site generator written in TypeScript and uses Bun.

- Build logic lives in `build/`
- Default site content and static assets for `tada init` live in `init/`
- Markdown & HTML content is processed; other file types are copied unchanged
- Lodash HTML templates in `templates/` are internal to the package
- Client-side code is in `src/`

## Feature specifications (specs)

Each feature is documented separately in `spec/`. Consult the documentation
to answer questions about functionality. When adding new features, first
create an appropriately named Markdown file in `spec/` describing it.

### Keeping specs in sync

After changing code, check whether the relevant spec still matches. Look at
the claims the spec makes (default values, descriptions of frontend styles
or layout, configuration options, technology choices/third-party dependencies)
and verify them against the current code.

For a broader audit across all specs, use `git log` to compare each spec's
last modification date against changes to the code it describes. Specs that
have not been touched since older commits are the most likely to be stale.
Verify findings against the actual code before making changes in `spec/`,
and avoid cursory or surface-level reads which may produce false specs.

## Style

- Do not use dashes, especially em dashes, just write plain sentences
- Do not use decorative Unicode symbols, especially arrows

## CLI commands

- Create a new site: `tada init <dirname>`
- Build development: `tada dev` (uses `site.dev.json`)
- Build production: `tada prod` (uses `site.prod.json`)
- Start dev web server: `tada serve`
- Watch files: `tada watch`
- Clean build artifacts: `tada clean`
- Lint: `bun run lint`
- Typecheck: `bun run typecheck`
- Run unit tests: `bun test`
- Run a single unit test: `bun test build/code.test.ts`
- Run functional tests: `AGENT=1 bun run test:functional`

Functional tests are black-box Python/pytest tests in `functional_tests/` that
exercise the CLI end-to-end (init, dev, prod, watch, clean). They use
`subprocess` to run Tada and assert on exit codes, stdout, and file system state.

## Testing locally

This repository is the Tada **package**, not a Tada site. Do not run `tada dev`
or `tada prod` in this directory, there is no site here. To test:

1. `bun run init-example`
2. `cd example`
3. `../bin/tada.ts dev` (or `prod`, `serve`, etc.)

The `init/` directory contains the default content and public files copied into
new projects by `tada init`. It is not a buildable site on its own.

## Preview server

After starting the preview server, navigate to `/index.html` with `preview_eval`
since the dev server emulates S3 and does not serve directory indexes.

## Formatting

The pre-commit hook runs Prettier. Do not run any commands to format code.
There is no code formatter for Python code.
