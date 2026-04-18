# Contributing to Tada

Thank you for your interest in contributing to Tada. This document covers how to
set up your development environment and submit changes.


## Prerequisites

- A Unix-like environment (macOS, Linux, or WSL on Windows)
- [Bun](https://bun.sh/)
- A recent Java JDK (for the literate Java feature)
- [MuPDF](https://mupdf.com/) (the `mutool` command for PDF text extraction)
- Python 3 (for functional tests)


## Getting started

Clone the repo and install dependencies:

```
git clone https://github.com/abreen/tada.git
cd tada
bun install
```

To test your changes to Tada against a real site, use the `init-example` script:

```
bun run init-example
cd example
../bin/tada.ts dev
../bin/tada.ts serve
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
bun run lint        # Run the linter
bun run lint:python # Run the Python linter for functional tests
bun run typecheck   # Run TypeScript's type checker
```

These checks run automatically as part of the Git pre-commit hook.

### Running tests

From the repository root:

```
bun test                      # Unit tests
bun test build/code.test.ts   # Run a single unit test file
bun test:functional           # Black-box tests of Tada functionality
bun test:all                  # Run all unit & functional tests
```

The functional tests exercise the CLI end-to-end and may be slow on older
machines.


## Code style

The Git pre-commit hook formats JavaScript, TypeScript, JSON, and SCSS with
Prettier, and formats `functional_tests/*.py` with Ruff. You don't need to run
these formatters yourself, but you may configure your IDE to run them when
saving a file.

The pre-commit hook also runs ESLint, Ruff's Python linter, and TypeScript's
type checker.


## Logging

Set `TADA_LOG_LEVEL` to control build log verbosity. Valid levels (most to least
verbose): `debug`, `info`, `warn`, `error`. Default is `info`.

```
TADA_LOG_LEVEL=debug ../bin/tada.ts dev
```


## Submitting changes

1. Create a feature branch
2. Make your changes
3. Open a pull request against `main`


## License

By contributing, you agree that your contributions will be licensed under the
[MIT License](LICENSE).
