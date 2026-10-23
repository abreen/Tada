# Contributing to Tada

Thank you for your interest in contributing to Tada. This document covers how to
set up your development environment and submit changes.


## Prerequisites

- [Bun](https://bun.com/)
- [MuPDF](https://mupdf.com/) (the `mutool` command for PDF text extraction)
- A recent Java JDK (for Java traces and the literate Java feature)
- Python 3 (for functional tests and Python traces)


## Getting started

Clone the repo and install dependencies:

```
git clone https://github.com/abreen/tada.git
cd tada
bun install
bun run setup:python
bunx playwright install
```

To verify your local toolchain, run:

```
bun run check-deps
```


## Development workflow

### Building and previewing

From the `example/` directory created above, call the `tada.ts` script in the
Git repository. Do not use the globally installed `tada` command, if you
installed it.

| Command | Description |
|---------|-------------|
| `../bin/tada.ts dev` | Build for local development |
| `../bin/tada.ts serve` | Start dev server at `http://localhost:8080` |
| `../bin/tada.ts watch` | Watch for changes and rebuild |
| `../bin/tada.ts clean` | Remove `dist/` |

### Running checks

From the repository root:

```
bun run format          # Run Prettier
bun run lint            # Run the linter
bun run typecheck       # Run TypeScript's type checker
bun run format:python   # Run the code formatter for Python
bun run lint:python     # Run the linter for Python
```

These checks run automatically as part of the Git pre-commit hook.

### Running tests

From the repository root:

```
bun test                      # Run all unit tests
bun test build/code.test.ts   # Run a single unit test file
bun run test:playwright       # Run browser tests using Playwright
bun run test:functional       # Black-box tests of Tada functionality
bun run test:all              # Run all unit & functional tests
```

The functional tests exercise the CLI end-to-end and may be slow on older
machines.

The Playwright tests start their own test servers on free ports, so several
checkouts or worktrees can run them at the same time. To pin a server's port,
set `TADA_PW_PORT_TEST`, `TADA_PW_PORT_APPEARANCE`,
`TADA_PW_PORT_NO_NAV_SEARCH`, or `TADA_PW_PORT_NO_NAV_STATIC` (see
`playwright/ports.ts`).


## Code style

The Git pre-commit hook formats JavaScript, TypeScript, JSON, and SCSS with
Prettier, and formats `functional_tests/*.py` with Ruff. You don't need to run
these formatters yourself, but you may configure your IDE to run them when
saving a file.

The pre-commit hook also runs ESLint, Ruff's Python linter, and TypeScript's
type checker. Make sure you've run `bun run setup:python` so Ruff is available;
that command resolves the right Python interpreter for your platform.


## Logging

Set `TADA_LOG_LEVEL` to control build log verbosity. Valid levels (most to least
verbose): `debug`, `info`, `warn`, `error`. Default is `info`.

```
TADA_LOG_LEVEL=debug ../bin/tada.ts dev
```


## Submitting changes

1. Create a feature branch
2. Make your changes
3. Add a line under `## Unreleased` in `CHANGELOG.md` describing the change for
   site authors (skip this for changes to tests, CI, or development tooling)
4. Open a pull request against `main`


## Publishing

Before publishing, rename `## Unreleased` in `CHANGELOG.md` to the new version
(for example, `## 1.22.7`), add an empty `## Unreleased` above it, and commit.
Then run `bun run publish-patch`, `publish-minor`, or `publish-major`. These
scripts stop if `CHANGELOG.md` has no section for the new version.


## License

By contributing, you agree that your contributions will be licensed under the
[MIT License](LICENSE).
