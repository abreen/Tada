# AGENTS.md

This codebase is a static site generator written in TypeScript and uses Bun.

- CLI entrypoints, argument validation, and command dispatch live in `bin/`
- The main build pipeline, content processing, asset generation, and most core logic live in `build/`
- Watch mode is split between `build/watch/` and `watch/` for planning, runtime state, and file-system events
- Client-side runtime code and styles live in `src/`, and internal Lodash HTML templates live in `templates/`
- Default `tada init` content lives in `init/`, feature documentation lives in `spec/`, and end-to-end coverage lives in `functional_tests/` and `playwright/`

## Feature specifications

Each feature is documented in `spec/`. Use the relevant spec to answer behavior questions, and add a matching Markdown file there when you add a new feature.

After changing code, update the relevant spec if behavior, defaults, options, dependencies, or UI details no longer match. For broader audits, use `git log` to spot stale specs, then verify against the code before editing.

## Commands

This repository is the Tada package, not a Tada site. Do not run `tada dev` or `tada prod` in this directory because there is no site here.

- Create the example site: `bun run init-example`
- Run the local CLI against the example site: `cd example && ../bin/tada.ts dev`
- Run another local CLI subcommand against the example site: `cd example && ../bin/tada.ts prod`
- Lint: `bun run lint`
- Lint Sass: `bun run lint:sass`
- Typecheck: `bun run typecheck`
- Run unit tests: `bun test`
- Run a single unit test: `bun test build/code.test.ts`
- Run functional tests: `bun run test:functional`
- Run functional tests with extra pytest args: `bun run test:functional -k watch`
- Run Playwright tests: `bun run test:playwright`

## Unit test rules

- Never rely on JSDOM to test browser behavior like navigation, instead use a Playwright test
- Never read or modify real files/directories in a unit test
- If you need to test filesystem behavior, write a functional test
- Never mock globals; instead mock the `globals.ts` module (either `build/globals.ts` or `src/globals.ts`)
- In `src/`, dunder variables like `__IS_DEV__` and `__SITE_BASE_PATH__` are replaced at build time; they are the only exception to the globals rule
- The dunder variables are initialized for unit tests in `test/unit-test-preload.ts`; tests can set them on `globalThis` when needed

## Code style/formatting

The pre-commit hook runs the code formatter. Do not run formatting commands manually.
