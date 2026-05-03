# AGENTS.md

This codebase is a static site generator written in TypeScript and uses Bun.

- CLI entrypoints, argument validation, and command dispatch live in `bin/`
- The main build pipeline, content processing, asset generation, and most core logic live in `build/`
- Watch mode lives under `build/watch/` for planning, runtime state, and file-system events
- Client-side runtime code and styles live in `src/`, and internal Lodash HTML templates live in `templates/`
- Default `tada init` content lives in `init/`, feature documentation lives in `spec/`, and end-to-end coverage lives in `functional_tests/` and `playwright/`

## Feature specifications

Each feature is documented in `spec/`. Use the relevant spec to answer behavior questions, and add a matching Markdown file there when you add a new feature.

After changing code, update the relevant spec if behavior, defaults, options, dependencies, or UI details no longer match. For broader audits, use `git log` to spot stale specs, then verify against the code before editing.

## Progressive enhancement

New features must work with client-side JavaScript turned off. Treat JS as progressive enhancement over useful build-time HTML. This is a static site generator; do as much as possible at build time.

- Render core content, links, anchors, and fallbacks in `build/` or `templates/`, not only in `src/`
- Gate JS-only CSS behind `.js`; do not hide content by default and reveal it only from client code
- Render client-only controls `disabled`, `hidden`, or inert until mounted
- Use `<noscript>` or build-time fallback HTML when a feature cannot provide equivalent no-JS behavior

Existing patterns: nav and TOCs navigate without client routing; header nav and Markdown details expand without JS; timezone rendering shows the default timezone without JS; code downloads work without the File System Access API.

## Commands

This repository is the Tada package, not a Tada site. Do not run `tada dev` or `tada prod` in this directory because there is no site here.

- Create the example site: `bun run init-example`
- Run the local CLI against the example site: `cd example && ../bin/tada.ts dev`
- Run another local CLI subcommand against the example site: `cd example && ../bin/tada.ts prod`
- Lint: `bun run lint`
- Lint Sass: `bun run lint:sass`
- Typecheck: `bun run typecheck`
- Run unit tests: `bun run test:unit` (do not use `bun test`)
- Run a single unit test: `bun run test:unit build/code.test.ts`
- Run Playwright tests: `bun run test:playwright`
- Run functional tests: `bun run test:functional`
- Run a single functional test file: `bun run test:functional functional_tests/test_init.py`
- Run the entire test suite: `bun run test:all`
- Run unit & functional tests, collecting coverage: `bun run test:coverage`

Functional tests are CPU intensive and may take over 2 minutes, even on powerful machines.

## Unit test rules

- Never rely on JSDOM to test browser behavior like navigation, instead use a Playwright test
- Never read or modify real files/directories in a unit test
- If you need to test creating/reading/writing files, write a functional test
- Never mock globals; instead mock the `globals.ts` module (either `build/globals.ts` or `src/globals.ts`)
- In `src/`, dunder variables like `__IS_DEV__` and `__SITE_BASE_PATH__` are replaced at build time; they are the only exception to the globals rule
- The dunder variables are initialized for unit tests in `test/unit-test-preload.ts`; tests can set them on `globalThis` when needed

## Playwright test rules

- Use Playwright for real browser behavior: navigation, scrolling, focus, fullscreen, pointer and keyboard input, visibility, accessibility state, browser APIs, and cursor changes tied to interaction modes
- Do not use Playwright to lock down incidental styling like exact colors, borders, shadows, fonts, pixel-perfect dimensions, screenshots, or decorative CSS
- Geometry checks are allowed only when geometry is the behavior under test, such as scroll restoration or target-in-viewport checks, and should use broad user-observable outcomes
- Prefer role, text, URL, DOM state, accessibility attributes, and interaction outcomes over computed styles or style-only classes

## Code style/formatting

The pre-commit hook runs the code formatter. Do not run formatting commands manually.

## Security threat model

When generating a site, the author's content is trusted. Authors can write raw HTML/JavaScript on their pages and use Lodash expressions in content, front matter, and configuration files.
Do not report security problems that assume an author is a malicious actor.
