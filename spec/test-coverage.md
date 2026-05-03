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
