import { afterAll, afterEach, describe, expect, mock, test } from 'bun:test';
import childProcess from 'child_process';
import { platform } from 'os';

const spawn = mock<typeof childProcess.spawnSync>();
const exec = mock<typeof childProcess.execFileSync>();
const originalChildProcess = { ...childProcess };
mock.module('child_process', () => ({
  ...originalChildProcess,
  spawnSync: spawn,
  execFileSync: exec,
}));
afterAll(() => {
  mock.module('child_process', () => originalChildProcess);
});
const { execFileSyncPython, resolvePythonCommand, spawnSyncPython } =
  await import('./command');
const { runPythonModuleSync } = await import('./module');

afterEach(() => {
  spawn.mockReset();
  exec.mockReset();
});

describe('Python commands', () => {
  test('resolves an available native interpreter', () => {
    spawn.mockReturnValue({ status: 0 } as ReturnType<
      typeof childProcess.spawnSync
    >);
    const command = platform() === 'win32' ? 'python' : 'python3';
    expect(resolvePythonCommand()).toEqual({ shell: 'direct', command });
    expect(spawn).toHaveBeenCalledWith(command, ['--version'], {
      stdio: 'ignore',
    });
  });

  test('reports no interpreter when every probe fails', () => {
    spawn.mockReturnValue({ status: null } as ReturnType<
      typeof childProcess.spawnSync
    >);
    expect(resolvePythonCommand()).toBeNull();
  });

  for (const shell of ['direct', 'powershell'] as const) {
    test(`${shell} preserves spaces, quotes, and shell metacharacters in arguments`, () => {
      const args = ['-c', "print('hello')", 'a b', '$HOME; & echo unsafe', ''];
      const options = {
        encoding: 'utf8' as const,
        env: { TEST_VALUE: 'kept' },
      };
      const python = { shell, command: 'python3' as const };
      const command = shell === 'direct' ? 'python3' : 'powershell.exe';
      const expectedArgs =
        shell === 'direct'
          ? args
          : [
              '-NoProfile',
              '-NonInteractive',
              '-Command',
              "python3 '-c' 'print(''hello'')' 'a b' '$HOME; & echo unsafe' ''",
            ];
      exec.mockReturnValue('hello\n');
      expect(execFileSyncPython(args, options, python)).toBe('hello\n');
      expect(exec).toHaveBeenCalledWith(command, expectedArgs, options);
      const result = { status: 7, stdout: 'output' } as ReturnType<
        typeof childProcess.spawnSync
      >;
      spawn.mockReturnValue(result);
      expect(spawnSyncPython(args, options, python)).toBe(result);
      expect(spawn).toHaveBeenCalledWith(command, expectedArgs, options);
    });
  }

  test('propagates execution errors to the caller', () => {
    const error = new Error('interpreter failed');
    exec.mockImplementation(() => {
      throw error;
    });
    expect(() =>
      execFileSyncPython(
        ['-c', 'bad code'],
        { encoding: 'utf8' },
        { shell: 'direct', command: 'python3' },
      ),
    ).toThrow(error);
  });
});

describe('Python module runner', () => {
  for (const status of [0, 3, null]) {
    test(`returns ${status ?? 'failure'} for a module process status of ${status}`, () => {
      spawn.mockReturnValueOnce({ status: 0 } as ReturnType<
        typeof childProcess.spawnSync
      >);
      spawn.mockReturnValueOnce({ status } as ReturnType<
        typeof childProcess.spawnSync
      >);
      const options = { stdio: 'ignore' as const, env: { PYTHONUTF8: '1' } };
      expect(
        runPythonModuleSync('pytest', ['a path/test.py', '-q'], options),
      ).toBe(status ?? 1);
      expect(spawn).toHaveBeenLastCalledWith(
        platform() === 'win32' ? 'python' : 'python3',
        ['-m', 'pytest', 'a path/test.py', '-q'],
        options,
      );
    });
  }
});
