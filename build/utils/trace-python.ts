import path from 'path';
import { execFileSync } from 'child_process';

const PYTHON_CANDIDATES = ['python3', 'python'] as const;

function commandExists(command: string): boolean {
  try {
    execFileSync(command, ['--version'], { stdio: ['pipe', 'pipe', 'pipe'] });
    return true;
  } catch {
    return false;
  }
}

export function resolvePythonCommand(): string | null {
  for (const candidate of PYTHON_CANDIDATES) {
    if (commandExists(candidate)) {
      return candidate;
    }
  }
  return null;
}

export function runPythonTrace(pythonFilePath: string): string {
  const pythonCommand = resolvePythonCommand();
  if (!pythonCommand) {
    throw new Error('python3 or python is required to generate Python traces');
  }

  const runnerPath = path.join(
    import.meta.dir,
    'python-runner',
    'trace_runner.py',
  );
  return execFileSync(pythonCommand, [runnerPath, pythonFilePath], {
    timeout: 60000,
    encoding: 'utf-8',
    maxBuffer: 50 * 1024 * 1024,
  });
}
