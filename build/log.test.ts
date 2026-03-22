import { describe, expect, test } from 'bun:test';
import { makeLogger, getFlair } from './log';

function captureOutput(fn: () => void): { stdout: string; stderr: string } {
  let stdout = '';
  let stderr = '';
  const origStdout = process.stdout.write;
  const origStderr = process.stderr.write;
  process.stdout.write = ((chunk: string) => {
    stdout += chunk;
    return true;
  }) as typeof process.stdout.write;
  process.stderr.write = ((chunk: string) => {
    stderr += chunk;
    return true;
  }) as typeof process.stderr.write;
  try {
    fn();
  } finally {
    process.stdout.write = origStdout;
    process.stderr.write = origStderr;
  }
  return { stdout, stderr };
}

describe('makeLogger', () => {
  test('creates a logger with default info level', () => {
    const log = makeLogger('test');
    expect(log.minLogLevel).toBe('info');
  });

  test('throws on invalid log level', () => {
    expect(() => makeLogger('test', 'verbose')).toThrow('Invalid log level');
  });

  test('info writes to stdout', () => {
    const log = makeLogger('test', 'info');
    const { stdout } = captureOutput(() => log.info`hello world`);
    expect(stdout).toContain('hello world');
  });

  test('debug is suppressed at info level', () => {
    const log = makeLogger('test', 'info');
    const { stderr } = captureOutput(() => log.debug`should not appear`);
    expect(stderr).toBe('');
  });

  test('debug appears at debug level', () => {
    const log = makeLogger('test', 'debug');
    const { stderr } = captureOutput(() => log.debug`visible`);
    expect(stderr).toContain('visible');
  });

  test('warn writes to stdout', () => {
    const log = makeLogger('test', 'warn');
    const { stdout } = captureOutput(() => log.warn`caution`);
    expect(stdout).toContain('caution');
  });

  test('error writes to stdout', () => {
    const log = makeLogger('test', 'error');
    const { stdout } = captureOutput(() => log.error`failure`);
    expect(stdout).toContain('failure');
  });

  test('event always writes', () => {
    const log = makeLogger('test', 'error');
    const { stdout } = captureOutput(() => log.event`done`);
    expect(stdout).toContain('done');
  });

  test('followup writes strings', () => {
    const log = makeLogger('test');
    const { stdout } = captureOutput(() => log.followup(['line1', 'line2']));
    expect(stdout).toContain('line1');
    expect(stdout).toContain('line2');
  });

  test('setMinLogLevel changes filtering', () => {
    const log = makeLogger('test', 'info');
    log.setMinLogLevel('error');
    const { stdout } = captureOutput(() => log.info`suppressed`);
    expect(stdout).toBe('');
  });

  test('handles empty name', () => {
    const log = makeLogger('');
    expect(log.minLogLevel).toBe('info');
  });

  test('handles __filename-style name', () => {
    const log = makeLogger('/path/to/module.ts');
    const { stdout } = captureOutput(() => log.info`test`);
    expect(stdout).toContain('test');
  });

  test('interpolates objects in template', () => {
    const log = makeLogger('test');
    const obj = { key: 'value' };
    const { stdout } = captureOutput(() => log.info`data: ${obj}`);
    expect(stdout).toContain('key');
  });
});

describe('getFlair', () => {
  test('returns a non-empty string with emoji', () => {
    const flair = getFlair();
    expect(flair.length).toBeGreaterThan(0);
    expect(flair).toContain('🎉');
  });
});
