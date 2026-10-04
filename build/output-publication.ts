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

// Windows reports these while another process (an indexer, antivirus, or the
// dev server) briefly holds a file open.
const BUSY_ERROR_CODES = new Set(['EBUSY', 'EPERM', 'EACCES']);
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

function outputsEqual(left: OutputContent, right: OutputContent): boolean {
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
      !outputsEqual(before.content, after.content) ||
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

/** Relative POSIX paths of the files under `rootDir`, except under `keep`. */
function listOutputFiles(
  rootDir: string,
  keep: readonly string[] = [],
): string[] {
  if (!fs.existsSync(rootDir)) {
    return [];
  }
  return fs
    .readdirSync(rootDir, { withFileTypes: true, recursive: true })
    .filter(entry => entry.isFile())
    .map(entry =>
      toPosix(path.relative(rootDir, path.join(entry.parentPath, entry.name))),
    )
    .filter(outputPath => !keep.some(prefix => outputPath.startsWith(prefix)));
}

/**
 * Mutations that make `rootDir` hold exactly `outputs`: every output is
 * written, and every other file is deleted except those under `keep`.
 */
export function planFullWrite(
  rootDir: string,
  outputs: ReadonlyMap<string, OutputFile>,
  keep: readonly string[] = [],
): FileMutation[] {
  const deletes: FileMutation[] = listOutputFiles(rootDir, keep)
    .filter(outputPath => !outputs.has(outputPath))
    .map(outputPath => ({ kind: 'delete', path: outputPath }));
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

/**
 * Applies mutations to the files in `rootDir` in place. Deletes run first,
 * deepest paths first, and remove directories they leave empty, so an output
 * can change between a file and a directory. Nothing is renamed, staged, or
 * rolled back: if a write fails, the error is thrown and earlier writes stay.
 */
export function applyMutations(
  rootDir: string,
  mutations: readonly FileMutation[],
): void {
  const deletes = mutations
    .filter(mutation => mutation.kind === 'delete')
    .sort((a, b) => b.path.length - a.path.length);
  for (const mutation of deletes) {
    const target = path.resolve(rootDir, mutation.path);
    retryWhileBusy(() => fs.rmSync(target, { force: true }));
    pruneEmptyDirs(rootDir, target);
  }
  for (const mutation of mutations) {
    if (mutation.kind === 'write') {
      const target = path.resolve(rootDir, mutation.path);
      retryWhileBusy(() => writeOutputFile(target, mutation.content));
    }
  }
}
