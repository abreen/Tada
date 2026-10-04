import fs from 'fs';
import path from 'path';
import { globals } from './globals';
import { toPosix } from './utils/paths';
import type { OutputContent } from './types';

type FileMutation =
  | { kind: 'write'; path: string; content: OutputContent }
  | { kind: 'delete'; path: string };

/** An output file and the source that produced it */
export interface OutputFile {
  sourcePath: string;
  content: OutputContent;
}

// EBUSY means a file is briefly held open. On Windows, EPERM and EACCES also
// mean that (an indexer, antivirus, or the dev server holding the file); on
// other platforms they are permanent permission errors and are not retried.
const BUSY_ERROR_CODES = new Set(
  process.platform === 'win32' ? ['EBUSY', 'EPERM', 'EACCES'] : ['EBUSY'],
);
const BUSY_RETRY_COUNT = 4;
const BUSY_RETRY_DELAY_MS = 50;

function retryWhileBusy(action: () => void): void {
  for (let attempt = 0; ; attempt++) {
    try {
      action();
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (attempt >= BUSY_RETRY_COUNT || !code || !BUSY_ERROR_CODES.has(code)) {
        throw error;
      }
      globals.sleepSync(BUSY_RETRY_DELAY_MS);
    }
  }
}

/** Writes rendered text or bytes, or copies a referenced source file. */
export function writeOutputFile(
  filePath: string,
  content: OutputContent,
): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  if (typeof content === 'string' || content instanceof Uint8Array) {
    fs.writeFileSync(filePath, content);
  } else {
    fs.copyFileSync(content.copyFrom, filePath);
  }
}

export function sameOutputContent(
  left: OutputContent,
  right: OutputContent,
): boolean {
  if (typeof left === 'string' || typeof right === 'string') {
    return left === right;
  }
  if (left instanceof Uint8Array || right instanceof Uint8Array) {
    return (
      left instanceof Uint8Array &&
      right instanceof Uint8Array &&
      Buffer.compare(left, right) === 0
    );
  }
  // Copied files compare by source path; a source whose contents changed is
  // always rebuilt, which forces a write.
  return left.copyFrom === right.copyFrom;
}

/**
 * Mutations from one build's outputs to the next. Outputs from a source in
 * `forceSourcePaths` are rewritten even when they look unchanged.
 */
export function computeMutations(
  previous: ReadonlyMap<string, OutputFile>,
  next: ReadonlyMap<string, OutputFile>,
  forceSourcePaths: ReadonlySet<string> = new Set(),
): FileMutation[] {
  const mutations: FileMutation[] = [];
  for (const outputPath of new Set([...previous.keys(), ...next.keys()])) {
    const before = previous.get(outputPath);
    const after = next.get(outputPath);
    if (!after) {
      mutations.push({ kind: 'delete', path: outputPath });
    } else if (
      !before ||
      !sameOutputContent(before.content, after.content) ||
      forceSourcePaths.has(after.sourcePath)
    ) {
      mutations.push({
        kind: 'write',
        path: outputPath,
        content: after.content,
      });
    }
  }
  return mutations;
}

/**
 * Mutations that make `rootDir` hold exactly `outputs`: every output is
 * written, and every other file and empty directory is deleted except those
 * under `keep`.
 */
export function planFullWrite(
  rootDir: string,
  outputs: ReadonlyMap<string, OutputFile>,
  keep: readonly string[] = [],
): FileMutation[] {
  const files: string[] = [];
  const dirs: string[] = [];
  // Walk one level at a time: a recursive listing would follow symbolic links
  // to directories. A link is listed as a file, so deleting it removes only
  // the link, never what it points to.
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      const relPath = toPosix(path.relative(rootDir, fullPath));
      if (entry.isDirectory()) {
        dirs.push(relPath);
        walk(fullPath);
      } else {
        files.push(relPath);
      }
    }
  };
  if (fs.existsSync(rootDir)) {
    walk(rootDir);
  }
  const isKept = (relPath: string) =>
    keep.some(prefix => `${relPath}/`.startsWith(prefix));
  const dirsWithFiles = new Set<string>();
  for (const file of files) {
    const segments = file.split('/');
    for (let i = 1; i < segments.length; i++) {
      dirsWithFiles.add(segments.slice(0, i).join('/'));
    }
  }

  const deletes: FileMutation[] = [
    ...files.filter(file => !isKept(file) && !outputs.has(file)),
    ...dirs.filter(dir => !isKept(dir) && !dirsWithFiles.has(dir)),
  ].map(relPath => ({ kind: 'delete', path: relPath }));
  const writes: FileMutation[] = [...outputs].map(([outputPath, output]) => ({
    kind: 'write',
    path: outputPath,
    content: output.content,
  }));
  return [...deletes, ...writes];
}

function pruneEmptyDirs(rootDir: string, filePath: string): void {
  const root = path.resolve(rootDir);
  for (
    let dir = path.dirname(filePath);
    dir !== root;
    dir = path.dirname(dir)
  ) {
    try {
      fs.rmdirSync(dir);
    } catch {
      return;
    }
  }
}

/** Throws if a path would be reached through a symbolic link below `rootDir`. */
function createSymlinkGuard(rootDir: string): (target: string) => void {
  const root = path.resolve(rootDir);
  const safeDirs = new Set<string>([root]);
  return target => {
    const visited: string[] = [];
    for (
      let dir = path.dirname(target);
      !safeDirs.has(dir) && dir.startsWith(root + path.sep);
      dir = path.dirname(dir)
    ) {
      if (fs.lstatSync(dir, { throwIfNoEntry: false })?.isSymbolicLink()) {
        throw new Error(`Refusing to write through the symbolic link ${dir}`);
      }
      visited.push(dir);
    }
    for (const dir of visited) {
      safeDirs.add(dir);
    }
  };
}

/**
 * Applies mutations to the files in `rootDir` in place. Deletes run first,
 * deepest paths first, and remove directories they leave empty, so an output
 * can change between a file and a directory. Nothing is renamed, staged, or
 * rolled back: if a write fails, the error is thrown and earlier writes stay.
 * Nothing is written or deleted through a symbolic link.
 */
export function applyMutations(
  rootDir: string,
  mutations: readonly FileMutation[],
): void {
  const assertNotThroughSymlink = createSymlinkGuard(rootDir);
  const deletes = mutations
    .filter(mutation => mutation.kind === 'delete')
    .sort((a, b) => b.path.length - a.path.length);
  for (const mutation of deletes) {
    const target = path.resolve(rootDir, mutation.path);
    assertNotThroughSymlink(target);
    retryWhileBusy(() => {
      if (fs.lstatSync(target, { throwIfNoEntry: false })?.isDirectory()) {
        fs.rmdirSync(target);
      } else {
        fs.rmSync(target, { force: true });
      }
    });
    pruneEmptyDirs(rootDir, target);
  }
  for (const mutation of mutations) {
    if (mutation.kind === 'write') {
      const target = path.resolve(rootDir, mutation.path);
      assertNotThroughSymlink(target);
      retryWhileBusy(() => {
        // Replace a link at the target itself; writing would follow it
        if (fs.lstatSync(target, { throwIfNoEntry: false })?.isSymbolicLink()) {
          fs.rmSync(target, { force: true });
        }
        writeOutputFile(target, mutation.content);
      });
    }
  }
}
