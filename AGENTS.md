# AGENTS.md

This codebase is a static site generator written in TypeScript and uses Bun.

- Build logic lives in `build/`
- Default site content and static assets for `tada init` live in `init/`
- Markdown and HTML content is processed. Other file types are copied unchanged.
- Lodash HTML templates in `templates/` are internal to the package
- Client-side code is in `src/`

## Feature specifications

Each feature is documented separately in `spec/`. Consult the relevant spec to answer questions about functionality. When adding a new feature, first create an appropriately named Markdown file in `spec/` describing it.

### Keeping specs in sync

After changing code, check whether the relevant spec still matches. Look at the claims the spec makes, including default values, descriptions of frontend styles or layout, configuration options, technology choices, and third-party dependencies, and verify them against the current code.

For a broader audit across all specs, use `git log` to compare each spec's last modification date against changes to the code it describes. Specs that have not been touched since older commits are the most likely to be stale. Verify findings against the actual code before making changes in `spec/`, and avoid cursory or surface-level reads which may produce false positives.

## Style

- Do not use em dashes
- Do not use decorative Unicode symbols such as arrows
- Keep written instructions and summaries plain and direct
- Type-only shared modules in this repo should use `.d.ts` files, matching
  existing files such as `build/types.d.ts` and `types/*.d.ts`

## Commands

- Create a new site: `tada init <dirname>`
- Build development: `tada dev` (uses `site.dev.json`)
- Build production: `tada prod` (uses `site.prod.json`)
- Start dev web server: `tada serve`
- Watch files: `tada watch`
- Clean build artifacts: `tada clean`
- Lint: `bun run lint`
- Set up Python tooling for functional tests and Ruff: `bun run setup:python`
- Typecheck: `bun run typecheck`
- Run unit tests: `bun test`
- Run a single unit test: `bun test build/code.test.ts`
- Run functional tests: `bun run test:functional`
- Run functional tests with extra pytest args: `bun run test:functional -k watch`

Functional tests are black-box Python and pytest tests in `functional_tests/` that exercise the CLI end to end, including `init`, `dev`, `prod`, `watch`, and `clean`. They use `subprocess` to run Tada and assert on exit codes, stdout, and file system state.

Do not add new unit tests that create, modify, or delete files or directories.
Coverage for file-system behavior belongs in the functional test suite.

## Testing locally

This repository is the Tada package, not a Tada site. Do not run `tada dev` or `tada prod` in this directory because there is no site here. To test:

1. `bun run init-example`
2. `cd example`
3. `../bin/tada.ts dev` or another subcommand such as `prod` or `diff`

The `init/` directory contains the default content and public files copied into new projects by `tada init`. It is not a buildable site on its own.

## Formatting

The pre-commit hook runs Prettier for JavaScript and Ruff for
`functional_tests/*.py`. Do not run formatting commands manually.
