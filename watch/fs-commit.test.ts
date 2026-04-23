import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import fs from 'fs';

const existingPaths = new Set<string>();
const renameCalls: Array<[string, string]> = [];
const renameFailures = new Map<string, number>();

const realDateNow = Date.now;
const realExistsSync = fs.existsSync;
const realRenameSync = fs.renameSync;
const realRmSync = fs.rmSync;

function resetFsState(): void {
  existingPaths.clear();
  renameCalls.length = 0;
  renameFailures.clear();
}

function keyForRename(sourcePath: string, targetPath: string): string {
  return `${sourcePath}->${targetPath}`;
}

const { applyCommitPlan } = await import('./fs-commit');

describe('applyCommitPlan', () => {
  beforeEach(() => {
    resetFsState();
    Date.now = () => 1234567890;
    fs.existsSync = ((filePath: string) =>
      existingPaths.has(filePath)) as typeof fs.existsSync;
    fs.renameSync = ((sourcePath: string, targetPath: string) => {
      renameCalls.push([sourcePath, targetPath]);

      const failureKey = keyForRename(sourcePath, targetPath);
      const remainingFailures = renameFailures.get(failureKey) || 0;
      if (remainingFailures > 0) {
        renameFailures.set(failureKey, remainingFailures - 1);
        const error = new Error(`busy: ${failureKey}`) as NodeJS.ErrnoException;
        error.code = 'EPERM';
        throw error;
      }

      if (!existingPaths.has(sourcePath)) {
        const error = new Error(
          `missing: ${sourcePath}`,
        ) as NodeJS.ErrnoException;
        error.code = 'ENOENT';
        throw error;
      }

      existingPaths.delete(sourcePath);
      existingPaths.add(targetPath);
    }) as typeof fs.renameSync;
    fs.rmSync = ((filePath: string) => {
      existingPaths.delete(filePath);
    }) as typeof fs.rmSync;
  });

  afterEach(() => {
    Date.now = realDateNow;
    fs.existsSync = realExistsSync;
    fs.renameSync = realRenameSync;
    fs.rmSync = realRmSync;
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
    const backupPath = `${targetPath}.bak-${process.pid}-${Date.now()}`;

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
