# Test coverage

Coverage collection is controlled by flags passed to the repository test script.
Do not enable test coverage with environment variables.

- Unit tests collect Bun coverage with `bun run test:unit --coverage` and write
  LCOV output to `coverage/unit/`.
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
coordinates so merged hits and the HTML report refer to the same lines. Untouched
source files use the same instrumentation when creating zero-coverage entries.

The Python launch helpers remain in coverage. Their tests exercise interpreter
probing, argument preservation (including PowerShell quoting), process errors,
and module exit statuses. Slides use browser tests for fullscreen fallback,
slide focus, heading presentation controls, and keyboard input inside slides.
