import path from 'path';
import { execFileSyncPython, resolvePythonCommand } from '../../python/command';

export function runPythonTrace(pythonFilePath: string): string {
  const pythonCommand = resolvePythonCommand();
  if (!pythonCommand) {
    throw new Error('Python is required to generate Python traces');
  }

  const runnerPath = path.join(
    import.meta.dir,
    'python-runner',
    'trace_runner.py',
  );
  const options = {
    timeout: 60000,
    encoding: 'utf-8' as const,
    maxBuffer: 50 * 1024 * 1024,
  };

  return execFileSyncPython(
    [runnerPath, pythonFilePath],
    options,
    pythonCommand,
  );
}
