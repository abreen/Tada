import { $ } from 'bun';

const suite = process.argv[2] ?? 'all';
const bunQuiet = ['--only-failures'];
const pytestFlags = [
  '-q',
  '--no-header',
  '--tb=line',
  '--maxfail=1',
  '-n=auto',
];
const playwrightQuiet = ['--reporter=dot', '--quiet'];

async function runUnit(extra: string[] = []) {
  await $`bun test ${bunQuiet} ${extra}`.throws(true);
}

async function runPlaywright() {
  await $`bunx playwright test ${playwrightQuiet}`.throws(true);
}

async function runFunctional(extra: string[] = []) {
  await $`pytest functional_tests/ ${pytestFlags} ${extra}`.throws(true);
}

if (suite == 'functional' || suite == 'coverage' || suite == 'all') {
  await $`python3 -m pip install -q -r functional_tests/requirements.txt`.throws(
    true,
  );
}

switch (suite) {
  case 'unit':
    await runUnit(process.argv.slice(3));
    break;
  case 'playwright':
    await runPlaywright();
    break;
  case 'functional':
    await runFunctional(process.argv.slice(3));
    break;
  case 'all':
    await runUnit();
    await runPlaywright();
    await runFunctional();
    break;
  case 'coverage':
    await $`rm -rf coverage/unit coverage/functional`;
    await runUnit(['--coverage']);
    await $`TADA_COVERAGE=1 pytest functional_tests/ ${pytestFlags}`.throws(
      true,
    );
    await $`bun run scripts/coverage-report.ts`.throws(true);
    break;
  default:
    console.error(
      `Usage: bun run scripts/test.ts {unit|playwright|functional|all|coverage}`,
    );
    process.exit(1);
}
