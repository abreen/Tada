import {
  execFileSync,
  spawnSync,
  type ExecFileSyncOptionsWithStringEncoding,
  type SpawnSyncOptions,
} from 'child_process';

export interface PythonCommand {
  shell: 'direct' | 'powershell';
  command: 'python' | 'python3';
}

const WINDOWS_PYTHON_CANDIDATES = ['python', 'python3'] as const;

function psQuote(arg: string): string {
  return `'${arg.replaceAll("'", "''")}'`;
}

function buildPowerShellArgs(
  command: PythonCommand['command'],
  args: string[],
): string[] {
  return [
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    [command, ...args.map(psQuote)].join(' '),
  ];
}

function commandExists(
  command: string,
  args: string[] = ['--version'],
): boolean {
  return spawnSync(command, args, { stdio: 'ignore' }).status === 0;
}

export function resolvePythonCommand(): PythonCommand | null {
  if (process.platform === 'win32') {
    for (const command of WINDOWS_PYTHON_CANDIDATES) {
      if (commandExists(command)) {
        return { shell: 'direct', command };
      }
    }

    for (const command of WINDOWS_PYTHON_CANDIDATES) {
      if (
        commandExists(
          'powershell.exe',
          buildPowerShellArgs(command, ['--version']),
        )
      ) {
        return { shell: 'powershell', command };
      }
    }

    return null;
  }

  return commandExists('python3')
    ? { shell: 'direct', command: 'python3' }
    : null;
}

export function execFileSyncPython(
  args: string[],
  options: ExecFileSyncOptionsWithStringEncoding,
  python: PythonCommand,
): string {
  if (python.shell === 'direct') {
    return execFileSync(python.command, args, options);
  }

  return execFileSync(
    'powershell.exe',
    buildPowerShellArgs(python.command, args),
    options,
  );
}

export function spawnSyncPython(
  args: string[],
  options: SpawnSyncOptions,
  python: PythonCommand,
) {
  if (python.shell === 'direct') {
    return spawnSync(python.command, args, options);
  }

  return spawnSync(
    'powershell.exe',
    buildPowerShellArgs(python.command, args),
    options,
  );
}
