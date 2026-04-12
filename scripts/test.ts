import { $ } from 'bun';

const suite = process.argv[2] ?? 'all';
const quiet = !!process.env.CLAUDECODE;

const bunQuiet = quiet ? ['--only-failures'] : [];
const pytestFlags = quiet
  ? ['-q', '--no-header', '--tb=line']
  : ['-v', '--durations=10'];
const playwrightQuiet = quiet ? ['--reporter=dot', '--quiet'] : [];

async function runUnit(extra: string[] = []) {
  await $`bun test ${bunQuiet} ${extra}`.throws(true);
}

async function runPlaywright() {
  await $`bunx playwright test ${playwrightQuiet}`.throws(true);
}

async function runFunctional() {
  await $`python3 -m pip install -q -r functional_tests/requirements.txt`.throws(
    true,
  );
  await $`python3 -m pytest functional_tests/ ${pytestFlags} -n auto`.throws(
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
    await runFunctional();
    break;
  case 'all':
    await runUnit();
    if (process.env.CLAUDE_CODE_REMOTE !== 'true') {
      await runPlaywright();
      await runFunctional();
    }
    break;
  case 'coverage':
    await $`rm -rf coverage/unit coverage/functional`;
    await runUnit(['--coverage']);
    await $`TADA_COVERAGE=1 python3 -m pip install -q -r functional_tests/requirements.txt`.throws(
      true,
    );
    await $`TADA_COVERAGE=1 python3 -m pytest functional_tests/ ${pytestFlags} -n auto`.throws(
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
