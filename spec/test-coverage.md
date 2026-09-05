# Test coverage

Coverage collection is controlled by flags passed to the repository test script.
Do not enable test coverage with environment variables.

- Unit tests collect Istanbul JSON coverage with `bun run test:unit --coverage`
  and write to `coverage/unit/`. The coverage-specific Bun configuration loads
  the instrumenter before the unit-test filesystem guard. After each test file,
  the collector overwrites one process snapshot so later files are included
  without adding duplicate snapshots to the report.
- Functional tests collect Istanbul JSON coverage with
  `bun run test:functional --coverage` and write to `coverage/functional/`.
- Playwright tests collect Istanbul JSON coverage with
  `bun run test:playwright --coverage` and write to `coverage/playwright/`.
  The coverage run uses an instrumented Playwright web server and does not reuse
  an existing local server.
- `bun run test:all --coverage` runs all three suites with coverage enabled.
- `bun run test:coverage` clears prior suite/report coverage, runs unit,
  Playwright, and functional tests with coverage, then writes the merged LCOV
  and HTML report to `coverage/report/`.

Istanbul instrumentation records locations in the original TypeScript before
transpilation. Browser, functional, and unit coverage must share those source
coordinates so merged hits and the HTML report refer to the same lines. All three
suites now use the same Istanbul statement, function, and branch maps. Bun native
LCOV counters are not merged: their line-only locations and function/branch
identities are incompatible with Istanbul counters. The report rejects mismatched
maps (for example after source edits); clear coverage and rerun all suites with
`bun run test:coverage` in that case. Old native LCOV files are ignored.

The report includes production TypeScript under `build/`, `src/`, `bin/`, and
`python/`. Declarations (`.d.ts`), unit test files (`.test.`), and
`test-helpers.ts` are excluded consistently from instrumentation, incoming streams,
and source discovery. Every included file gets an original-source zero-coverage
map before hits are merged, including untouched entrypoints and Python launch
helpers. Lines are counted once even when several statements share a line;
statements, functions, and branch arms retain their distinct Istanbul counters.
Scripts and test infrastructure are outside this production coverage scope.

The Python launch helpers remain in coverage. Their tests exercise interpreter
probing, argument preservation (including PowerShell quoting), process errors,
and module exit statuses. Slides use browser tests for fullscreen fallback,
slide focus, heading presentation controls, and keyboard input inside slides.
