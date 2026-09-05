import fs from 'fs';
import path from 'path';
import { globals, type Globals } from '../globals';
import type {
  ApplyMutationsCommitPlan,
  CommitPlan,
  ReplaceRootCommitPlan,
} from './types';

type CommitPlanGlobals = Pick<Globals, 'now' | 'pid' | 'sleepSync'>;

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

function renameWithRetry(
  sourcePath: string,
  targetPath: string,
  globals: CommitPlanGlobals,
): void {
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
      globals.sleepSync(RENAME_RETRY_DELAY_MS);
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

interface MutationJournalEntry {
  targetPath: string;
  backupPath?: string;
}

function applyMutations(
  plan: ApplyMutationsCommitPlan,
  globals: CommitPlanGlobals,
): void {
  const transactionRoot = fs.mkdtempSync(
    path.join(plan.rootDir, '.watch-stage-'),
  );
  const journal: MutationJournalEntry[] = [];
  const createdDirs: string[] = [];
  try {
    // Index staging paths so file/directory transitions cannot collide in staging.
    for (const [index, mutation] of plan.mutations.entries()) {
      if (mutation.kind === 'write') {
        fs.writeFileSync(
          path.join(transactionRoot, `write-${index}`),
          mutation.content,
        );
      }
    }

    for (const [index, mutation] of plan.mutations.entries()) {
      const targetPath = path.resolve(plan.rootDir, mutation.path);
      const existing = fs.lstatSync(targetPath, { throwIfNoEntry: false });
      if (existing?.isDirectory()) {
        throw new Error(
          `Cannot publish file mutation over directory: ${targetPath}`,
        );
      }
      const backupPath = existing
        ? path.join(transactionRoot, `backup-${index}`)
        : undefined;
      if (backupPath) {
        renameWithRetry(targetPath, backupPath, globals);
      }
      journal.push({ targetPath, backupPath });
      if (mutation.kind === 'write') {
        const firstCreated = fs.mkdirSync(path.dirname(targetPath), {
          recursive: true,
        });
        if (firstCreated) {
          let dir = path.dirname(targetPath);
          while (true) {
            createdDirs.push(dir);
            if (dir === firstCreated) {
              break;
            }
            dir = path.dirname(dir);
          }
        }
        renameWithRetry(
          path.join(transactionRoot, `write-${index}`),
          targetPath,
          globals,
        );
      }
    }
    for (const mutation of plan.mutations) {
      if (mutation.kind === 'delete') {
        pruneEmptyDirs(plan.rootDir, path.resolve(plan.rootDir, mutation.path));
      }
    }
  } catch (publicationError) {
    const rollbackErrors: unknown[] = [];
    const removeCreatedDirs = () => {
      for (const dir of [...new Set(createdDirs)].sort(
        (a, b) => b.length - a.length,
      )) {
        try {
          fs.rmdirSync(dir);
        } catch (error) {
          const code = (error as NodeJS.ErrnoException).code;
          if (code !== 'ENOENT' && code !== 'ENOTEMPTY' && code !== 'ENOTDIR') {
            rollbackErrors.push(error);
          }
        }
      }
    };
    for (const entry of journal.toReversed()) {
      try {
        removeCreatedDirs();
        fs.rmSync(entry.targetPath, { force: true });
        if (entry.backupPath) {
          ensureParentDir(entry.targetPath);
          renameWithRetry(entry.backupPath, entry.targetPath, globals);
        }
      } catch (error) {
        rollbackErrors.push(error);
      }
    }
    removeCreatedDirs();
    if (rollbackErrors.length > 0) {
      // Keep any unrestored originals available for manual recovery.
      throw new AggregateError(
        [publicationError, ...rollbackErrors],
        `Failed to publish and restore output; recovery files remain in ${transactionRoot}`,
        { cause: publicationError },
      );
    }
    removeDirIfExists(transactionRoot);
    throw publicationError;
  }
  removeDirIfExists(transactionRoot);
}

function replaceRoot(
  plan: ReplaceRootCommitPlan,
  globals: CommitPlanGlobals,
): void {
  const { targetPath, stagedPath } = plan;
  const backupDir = `${targetPath}.bak-${globals.pid()}-${globals.now()}`;
  const targetExists = fs.existsSync(targetPath);

  try {
    if (targetExists) {
      renameWithRetry(targetPath, backupDir, globals);
    }
    renameWithRetry(stagedPath, targetPath, globals);
    if (targetExists) {
      removeDirIfExists(backupDir);
    }
  } catch (err) {
    if (!fs.existsSync(targetPath) && fs.existsSync(backupDir)) {
      renameWithRetry(backupDir, targetPath, globals);
    }
    throw err;
  }
}

export function applyCommitPlan(plan: CommitPlan): void {
  const runtimeGlobals: CommitPlanGlobals = globals;
  if (plan.kind === 'replace-root') {
    replaceRoot(plan, runtimeGlobals);
    return;
  }

  applyMutations(plan, runtimeGlobals);
}
