import { $ } from 'bun';
import { runPythonModuleSync } from '../python/module';

const suite = process.argv[2] ?? 'all';

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

async function runUnit(extra: string[] = []) {
  await $`bun test ${bunTestFlags} ${extra}`.throws(true);
}

async function runPlaywright(extra: string[] = []) {
  await $`bunx playwright test ${playwrightFlags} ${extra}`.throws(true);
}

async function runFunctional(extra: string[] = []) {
  const exitCode = runPythonModuleSync(
    'pytest',
    ['functional_tests/', ...pytestFlags, ...extra],
    { stdio: 'inherit', env: { ...process.env, PYTHONUTF8: '1' } },
  );
  if (exitCode !== 0) {
    process.exit(exitCode);
  }
}

switch (suite) {
  case 'unit':
    await runUnit(process.argv.slice(3));
    break;
  case 'playwright':
    await runPlaywright(process.argv.slice(3));
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
    {
      const exitCode = runPythonModuleSync(
        'pytest',
        ['functional_tests/', ...pytestFlags],
        {
          stdio: 'inherit',
          env: { ...process.env, TADA_COVERAGE: '1', PYTHONUTF8: '1' },
        },
      );
      if (exitCode !== 0) {
        process.exit(exitCode);
      }
    }
    await $`bun run scripts/coverage-report.ts`.throws(true);
    break;
  default:
    console.error(
      `Usage: bun run scripts/test.ts {unit|playwright|functional|all|coverage}`,
    );
    process.exit(1);
}
