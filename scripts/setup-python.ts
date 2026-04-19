import { resolvePythonCommand, spawnSyncPython } from '../python/command';

function runPythonSetup(): number {
  const pythonCommand = resolvePythonCommand();
  if (!pythonCommand) {
    console.error(
      'Error: Python is required to set up functional test dependencies.',
    );
    return 1;
  }

  return (
    spawnSyncPython(
      ['-m', 'pip', 'install', '-q', '-r', 'functional_tests/requirements.txt'],
      { stdio: 'inherit' },
      pythonCommand,
    ).status ?? 1
  );
}

process.exit(runPythonSetup());
