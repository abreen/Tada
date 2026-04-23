import { beforeEach, describe, expect, mock, test } from 'bun:test';
import type fs from 'fs';
import { createGlobals } from '../build/globals.test';
import { createFsModuleMock } from '../build/test-helpers';

const existingPaths = new Set<string>();
const renameCalls: Array<[string, string]> = [];
const renameFailures = new Map<string, number>();

function resetFsState(): void {
  existingPaths.clear();
  renameCalls.length = 0;
  renameFailures.clear();
}

function keyForRename(sourcePath: string, targetPath: string): string {
  return `${sourcePath}->${targetPath}`;
}

function mockFs(): void {
  const mockedFs: Pick<
    typeof fs,
    | 'existsSync'
    | 'mkdirSync'
    | 'mkdtempSync'
    | 'renameSync'
    | 'rmdirSync'
    | 'rmSync'
    | 'writeFileSync'
  > = {
    existsSync(filePath: fs.PathLike) {
      return existingPaths.has(String(filePath));
    },
    mkdirSync() {
      return undefined;
    },
    mkdtempSync(prefix: string) {
      return `${prefix}stub`;
    },
    renameSync(sourcePath: fs.PathLike, targetPath: fs.PathLike) {
      const source = String(sourcePath);
      const target = String(targetPath);
      renameCalls.push([source, target]);

      const failureKey = keyForRename(source, target);
      const remainingFailures = renameFailures.get(failureKey) || 0;
      if (remainingFailures > 0) {
        renameFailures.set(failureKey, remainingFailures - 1);
        const error = new Error(`busy: ${failureKey}`) as NodeJS.ErrnoException;
        error.code = 'EPERM';
        throw error;
      }

      if (!existingPaths.has(source)) {
        const error = new Error(`missing: ${source}`) as NodeJS.ErrnoException;
        error.code = 'ENOENT';
        throw error;
      }

      existingPaths.delete(source);
      existingPaths.add(target);
    },
    rmdirSync() {
      return undefined;
    },
    rmSync(filePath: fs.PathLike) {
      existingPaths.delete(String(filePath));
      return undefined;
    },
    writeFileSync() {
      return undefined;
    },
  };

  mock.module('fs', () => createFsModuleMock(mockedFs));
}

function mockGlobals(): void {
  mock.module('../build/globals', () => ({
    globals: createGlobals({
      now() {
        return 1234567890;
      },
      pid() {
        return 42;
      },
    }),
  }));
}

const { applyCommitPlan } = await import('./fs-commit');

describe('applyCommitPlan', () => {
  beforeEach(() => {
    resetFsState();
    mockFs();
    mockGlobals();
  });

  test('replace-root retries a transient staged-directory EPERM during publish', () => {
    existingPaths.add('/tmp/dist-build-abc123');
    renameFailures.set(keyForRename('/tmp/dist-build-abc123', '/tmp/dist'), 1);

    applyCommitPlan({
      kind: 'replace-root',
      stagedPath: '/tmp/dist-build-abc123',
      targetPath: '/tmp/dist',
    });

    expect(
      renameCalls.filter(
        ([sourcePath, targetPath]) =>
          sourcePath === '/tmp/dist-build-abc123' && targetPath === '/tmp/dist',
      ),
    ).toHaveLength(2);
    expect(existingPaths.has('/tmp/dist')).toBe(true);
    expect(existingPaths.has('/tmp/dist-build-abc123')).toBe(false);
  });

  test('replace-root restores the previous target after a failed publish', () => {
    const stagedPath = '/tmp/dist-build-rollback';
    const targetPath = '/tmp/dist';
    const backupPath = `${targetPath}.bak-42-1234567890`;

    existingPaths.add(stagedPath);
    existingPaths.add(targetPath);
    renameFailures.set(keyForRename(stagedPath, targetPath), 99);

    expect(() =>
      applyCommitPlan({ kind: 'replace-root', stagedPath, targetPath }),
    ).toThrow(`busy: ${keyForRename(stagedPath, targetPath)}`);

    expect(existingPaths.has(targetPath)).toBe(true);
    expect(existingPaths.has(stagedPath)).toBe(true);
    expect(existingPaths.has(backupPath)).toBe(false);
  });
});
