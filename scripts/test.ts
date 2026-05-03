import { $ } from 'bun';
import { runPythonModuleSync } from '../python/module';

const suite = process.argv[2] ?? 'all';
const { coverage, extra } = parseTestFlags(process.argv.slice(3));

function parseTestFlags(args: string[]): {
  coverage: boolean;
  extra: string[];
} {
  const extra: string[] = [];
  let coverage = false;

  for (const arg of args) {
    if (arg === '--coverage') {
      coverage = true;
    } else {
      extra.push(arg);
    }
  }

  return { coverage, extra };
}

function shouldUseQuietFlags(): boolean {
  return Object.entries(process.env).some(
    ([key, value]) =>
      (key === 'CI' || key.endsWith('_CI')) &&
      (value === '1' || value === 'true'),
  );
}

const useQuietFlags = shouldUseQuietFlags();
const bunTestFlags = useQuietFlags ? ['--dots'] : [];
const playwrightFlags = useQuietFlags ? ['--reporter=dot'] : [];
const pytestFlags = ['--tb=line', '--maxfail=1', '-n=auto'];
if (useQuietFlags) {
  pytestFlags.unshift('-q');
  pytestFlags.unshift('--no-header');
} else {
  pytestFlags.unshift('-v');
}

async function runUnit(extra: string[] = [], coverage = false) {
  const coverageFlags = coverage ? ['--coverage'] : [];
  await $`bun test ${bunTestFlags} ${coverageFlags} ${extra}`.throws(true);
}

async function runPlaywright(extra: string[] = [], coverage = false) {
  const coverageFlags = coverage
    ? ['--config', 'playwright.coverage.config.ts']
    : [];
  await $`bunx playwright test ${playwrightFlags} ${coverageFlags} ${extra}`.throws(
    true,
  );
}

async function runFunctional(extra: string[] = [], coverage = false) {
  const testPaths =
    extra[0]?.startsWith('-') === false ? [] : ['functional_tests/'];
  const coverageFlags = coverage ? ['--coverage'] : [];
  const exitCode = runPythonModuleSync(
    'pytest',
    [...testPaths, ...pytestFlags, ...coverageFlags, ...extra],
    { stdio: 'inherit', env: { ...process.env, PYTHONUTF8: '1' } },
  );
  if (exitCode !== 0) {
    process.exit(exitCode);
  }
}

async function runAll(coverage = false) {
  await runUnit([], coverage);
  await runPlaywright([], coverage);
  await runFunctional([], coverage);
}

switch (suite) {
  case 'unit':
    await runUnit(extra, coverage);
    break;
  case 'playwright':
    await runPlaywright(extra, coverage);
    break;
  case 'functional':
    await runFunctional(extra, coverage);
    break;
  case 'all':
    await runAll(coverage);
    break;
  case 'coverage':
    await $`rm -rf coverage/unit coverage/functional coverage/playwright coverage/report`;
    await runAll(true);
    await $`bun run scripts/coverage-report.ts`.throws(true);
    break;
  default:
    console.error(
      `Usage: bun run scripts/test.ts {unit|playwright|functional|all|coverage} [--coverage] [test flags...]`,
    );
    process.exit(1);
}
