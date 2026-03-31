# AGENTS.md

This codebase is a static site generator written in TypeScript and uses Bun.

- Build logic lives in `build/`
- Default site content and static assets for `tada init` live in `init/`
- Markdown & HTML content is processed; other file types are copied unchanged
- Lodash HTML templates in `templates/` are internal to the package
- Client-side code is in `src/`

## Feature specifications (specs)

Each feature is documented separately in `spec/`. Consult the documentation
to answer questions about functionality. When implementing new features or
modifying existing ones, update the documentation in `spec/`.

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

## Formatting

The pre-commit hook runs Prettier. Do not run any commands to format code.
There is no code formatter for Python code.
