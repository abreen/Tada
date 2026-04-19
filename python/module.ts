import { resolvePythonCommand, spawnSyncPython } from './command';

export function runPythonModuleSync(
  moduleName: string,
  args: string[],
  options: { env?: NodeJS.ProcessEnv; stdio?: 'inherit' | 'ignore' } = {},
): number {
  const pythonCommand = resolvePythonCommand();
  if (!pythonCommand) {
    console.error(`Error: Python is required to run the ${moduleName} module.`);
    return 1;
  }

  return (
    spawnSyncPython(['-m', moduleName, ...args], options, pythonCommand)
      .status ?? 1
  );
}
