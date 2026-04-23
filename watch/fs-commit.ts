import fs from 'fs';
import path from 'path';
import type {
  ApplyMutationsCommitPlan,
  CommitPlan,
  FileMutation,
  ReplaceRootCommitPlan,
} from './types';

const TRANSIENT_RENAME_ERROR_CODES = new Set([
  'EACCES',
  'EBUSY',
  'ENOTEMPTY',
  'EPERM',
]);
const RENAME_RETRY_DELAY_MS = 25;
const RENAME_RETRY_COUNT = 8;

function removeDirIfExists(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

function ensureParentDir(filePath: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function isTransientRenameError(
  error: unknown,
  sourcePath: string,
): error is NodeJS.ErrnoException {
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  return (
    typeof code === 'string' &&
    TRANSIENT_RENAME_ERROR_CODES.has(code) &&
    fs.existsSync(sourcePath)
  );
}

function renameWithRetry(sourcePath: string, targetPath: string): void {
  for (let attempt = 0; attempt <= RENAME_RETRY_COUNT; attempt++) {
    try {
      fs.renameSync(sourcePath, targetPath);
      return;
    } catch (error) {
      if (
        attempt === RENAME_RETRY_COUNT ||
        !isTransientRenameError(error, sourcePath)
      ) {
        throw error;
      }
      Bun.sleepSync(RENAME_RETRY_DELAY_MS);
    }
  }
}

function pruneEmptyDirs(rootDir: string, filePath: string): void {
  let currentDir = path.dirname(filePath);
  const root = path.resolve(rootDir);
  while (currentDir !== root) {
    try {
      fs.rmdirSync(currentDir);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ENOTEMPTY' || code === 'ENOENT') {
        break;
      }
      throw err;
    }
    currentDir = path.dirname(currentDir);
  }
}

function applyFileMutation(
  rootDir: string,
  mutation: FileMutation,
  stagedRoot: string,
): void {
  const targetPath = path.join(rootDir, mutation.path);
  const stagedPath = path.join(stagedRoot, mutation.path);

  if (mutation.kind === 'write') {
    ensureParentDir(stagedPath);
    fs.writeFileSync(stagedPath, mutation.content);
    ensureParentDir(targetPath);
    renameWithRetry(stagedPath, targetPath);
    return;
  }

  fs.rmSync(targetPath, { force: true });
  pruneEmptyDirs(rootDir, targetPath);
}

function applyMutations(plan: ApplyMutationsCommitPlan): void {
  const stagedRoot = fs.mkdtempSync(path.join(plan.rootDir, '.watch-stage-'));
  try {
    for (const mutation of plan.mutations) {
      if (mutation.kind === 'write') {
        const stagedPath = path.join(stagedRoot, mutation.path);
        ensureParentDir(stagedPath);
        fs.writeFileSync(stagedPath, mutation.content);
      }
    }

    for (const mutation of plan.mutations) {
      applyFileMutation(plan.rootDir, mutation, stagedRoot);
    }
  } finally {
    removeDirIfExists(stagedRoot);
  }
}

function replaceRoot(plan: ReplaceRootCommitPlan): void {
  const { targetPath, stagedPath } = plan;
  const backupDir = `${targetPath}.bak-${process.pid}-${Date.now()}`;
  const targetExists = fs.existsSync(targetPath);

  try {
    if (targetExists) {
      renameWithRetry(targetPath, backupDir);
    }
    renameWithRetry(stagedPath, targetPath);
    if (targetExists) {
      removeDirIfExists(backupDir);
    }
  } catch (err) {
    if (!fs.existsSync(targetPath) && fs.existsSync(backupDir)) {
      renameWithRetry(backupDir, targetPath);
    }
    throw err;
  }
}

export function applyCommitPlan(plan: CommitPlan): void {
  if (plan.kind === 'replace-root') {
    replaceRoot(plan);
    return;
  }

  applyMutations(plan);
}
