import { beforeEach, describe, expect, mock, test } from 'bun:test';
import path from 'node:path';
import { createGlobals } from './globals.test';
import { createFsModuleMock } from './test-helpers';
import type { FileMutation } from './output-publication';

// Directories are null; files retain their contents so rollback assertions
// verify restored data as well as which paths survive.
const entries = new Map<string, string | null>();
const renameCalls: Array<[string, string]> = [];
const renameFailures = new Map<string, number>();
const root = path.resolve('publication-fixture');
const dist = path.join(root, 'dist');
let stageNumber = 0;
let failRestore = false;
let alternateMkdirSpelling = false;

function fsError(code: string, file: string): never {
  throw Object.assign(new Error(`${code}: ${file}`), { code });
}

function descendants(dir: string): string[] {
  return [...entries.keys()].filter(file => file.startsWith(dir + path.sep));
}

function mkdir(dir: string): string | undefined {
  if (entries.has(dir)) {
    if (entries.get(dir) !== null) {
      fsError('ENOTDIR', dir);
    }
    return undefined;
  }
  const parent = path.dirname(dir);
  const first = parent === dir ? undefined : mkdir(parent);
  entries.set(dir, null);
  return first ?? dir;
}

function put(file: string, content: string): void {
  mkdir(path.dirname(file));
  entries.set(file, content);
}

function snapshot() {
  return [...entries].sort(([a], [b]) => a.localeCompare(b));
}

function installMocks(): void {
  mock.module('fs', () =>
    createFsModuleMock({
      existsSync: (file: string) => entries.has(file),
      lstatSync(file: string) {
        return entries.has(file)
          ? { isDirectory: () => entries.get(file) === null }
          : undefined;
      },
      mkdirSync(dir: string) {
        const created = mkdir(dir);
        return created && alternateMkdirSpelling ? created + path.sep : created;
      },
      mkdtempSync(prefix: string) {
        const dir = `${prefix}${stageNumber++}`;
        mkdir(dir);
        return dir;
      },
      writeFileSync(file: string, content: string | Buffer) {
        if (entries.get(path.dirname(file)) !== null) {
          fsError('ENOENT', file);
        }
        entries.set(file, content.toString());
      },
      renameSync(source: string, target: string) {
        renameCalls.push([source, target]);
        if (failRestore && path.basename(source) === 'backup-0') {
          throw new Error('restore unavailable');
        }
        const key = `${source}->${target}`;
        const failures = renameFailures.get(key) ?? 0;
        if (failures > 0) {
          renameFailures.set(key, failures - 1);
          fsError('EPERM', source);
        }
        if (
          !entries.has(source) ||
          entries.get(path.dirname(target)) !== null
        ) {
          fsError('ENOENT', source);
        }
        for (const file of [source, ...descendants(source)]) {
          entries.set(target + file.slice(source.length), entries.get(file)!);
          entries.delete(file);
        }
      },
      rmdirSync(dir: string) {
        if (!entries.has(dir)) {
          fsError('ENOENT', dir);
        }
        if (entries.get(dir) !== null) {
          fsError('ENOTDIR', dir);
        }
        if (descendants(dir).length) {
          fsError('ENOTEMPTY', dir);
        }
        entries.delete(dir);
      },
      rmSync(file: string, options: { recursive?: boolean }) {
        if (entries.get(file) === null && !options.recursive) {
          fsError('EISDIR', file);
        }
        for (const child of descendants(file)) {
          entries.delete(child);
        }
        entries.delete(file);
      },
    }),
  );
  mock.module('./globals', () => ({
    globals: createGlobals({
      now: () => 1234567890,
      pid: () => 42,
      sleepSync: () => {},
    }),
  }));
}

installMocks();
const { applyCommitPlan } = await import('./output-publication');

beforeEach(() => {
  entries.clear();
  renameCalls.length = 0;
  renameFailures.clear();
  stageNumber = 0;
  failRestore = false;
  alternateMkdirSpelling = false;
  mkdir(root);
  installMocks();
});

describe('applyCommitPlan', () => {
  test('replace-root retries a transient staged-directory EPERM during publish', () => {
    const staged = path.join(root, 'staged');
    mkdir(staged);
    renameFailures.set(`${staged}->${dist}`, 1);
    applyCommitPlan({
      kind: 'replace-root',
      stagedPath: staged,
      targetPath: dist,
    });
    expect(
      renameCalls.filter(([from, to]) => from === staged && to === dist),
    ).toHaveLength(2);
    expect(entries.has(dist)).toBe(true);
    expect(entries.has(staged)).toBe(false);
  });

  test('replace-root restores the previous target after a failed publish', () => {
    const staged = path.join(root, 'staged');
    mkdir(staged);
    put(path.join(dist, 'index.html'), 'original');
    renameFailures.set(`${staged}->${dist}`, 99);
    expect(() =>
      applyCommitPlan({
        kind: 'replace-root',
        stagedPath: staged,
        targetPath: dist,
      }),
    ).toThrow('EPERM');
    expect(entries.get(path.join(dist, 'index.html'))).toBe('original');
    expect(entries.has(staged)).toBe(true);
    expect(entries.has(`${dist}.bak-42-1234567890`)).toBe(false);
  });

  test.each(['write', 'delete', 'parent', 'transition', 'recovery'] as const)(
    'incremental publication restores previous output after %s failure',
    failure => {
      put(path.join(dist, 'a.txt'), 'original');
      put(path.join(dist, 'old', 'deleted.txt'), 'deleted original');
      put(path.join(dist, 'z.txt', 'keep'), 'directory original');
      put(path.join(dist, 'blocked'), 'parent original');
      const before = snapshot();
      const mutations: FileMutation[] = [
        { kind: 'write', path: 'a.txt', content: 'changed' },
        { kind: 'delete', path: 'old/deleted.txt' },
        { kind: 'write', path: 'new/nested/file.txt', content: 'new' },
        { kind: 'write', path: 'new/nested/deeper/file.txt', content: 'deep' },
        ...(failure === 'transition'
          ? [
              { kind: 'delete' as const, path: 'blocked' },
              {
                kind: 'write' as const,
                path: 'blocked/child',
                content: 'child',
              },
            ]
          : []),
        failure === 'parent'
          ? { kind: 'write', path: 'blocked/child', content: 'fail' }
          : {
              kind: failure === 'delete' ? 'delete' : 'write',
              path: 'z.txt',
              content: 'fail',
            },
      ];
      failRestore = failure === 'recovery';
      const publish = () =>
        applyCommitPlan({ kind: 'apply-mutations', rootDir: dist, mutations });
      if (failRestore) {
        expect(publish).toThrow(AggregateError);
        expect(entries.get(path.join(dist, '.watch-stage-0', 'backup-0'))).toBe(
          'original',
        );
        expect(entries.get(path.join(dist, 'old', 'deleted.txt'))).toBe(
          'deleted original',
        );
        expect(entries.get(path.join(dist, 'z.txt', 'keep'))).toBe(
          'directory original',
        );
        return;
      }
      expect(publish).toThrow(
        failure === 'parent'
          ? 'ENOTDIR'
          : 'Cannot publish file mutation over directory',
      );
      expect(snapshot()).toEqual(before);
      applyCommitPlan({
        kind: 'apply-mutations',
        rootDir: dist,
        mutations: mutations.slice(0, 3),
      });
      expect(entries.get(path.join(dist, 'a.txt'))).toBe('changed');
      expect(entries.get(path.join(dist, 'new', 'nested', 'file.txt'))).toBe(
        'new',
      );
      expect(entries.has(path.join(dist, 'old'))).toBe(false);
      expect(
        [...entries.keys()].some(file => file.includes('.watch-stage-')),
      ).toBe(false);
    },
  );

  test('publication ignores equivalent mkdir return spelling during rollback and retry', () => {
    mkdir(path.join(dist, 'blocked'));
    const before = snapshot();
    alternateMkdirSpelling = true;
    const write: FileMutation = {
      kind: 'write',
      path: 'new/nested/file.txt',
      content: 'published',
    };
    expect(() =>
      applyCommitPlan({
        kind: 'apply-mutations',
        rootDir: dist,
        mutations: [write, { kind: 'write', path: 'blocked', content: 'fail' }],
      }),
    ).toThrow('Cannot publish file mutation over directory');
    expect(snapshot()).toEqual(before);
    applyCommitPlan({
      kind: 'apply-mutations',
      rootDir: dist,
      mutations: [write],
    });
    expect(entries.get(path.join(dist, 'new', 'nested', 'file.txt'))).toBe(
      'published',
    );
    expect(
      [...entries.keys()].some(file => file.includes('.watch-stage-')),
    ).toBe(false);
  });
});

test('publishes a directory-to-file transition regardless of mutation order', () => {
  put(path.join(dist, 'item', 'nested', 'child.txt'), 'old');
  applyCommitPlan({
    kind: 'apply-mutations',
    rootDir: dist,
    mutations: [
      { kind: 'write', path: 'item', content: 'new' },
      { kind: 'delete', path: 'item/nested/child.txt' },
    ],
  });
  expect(entries.get(path.join(dist, 'item'))).toBe('new');
  expect(entries.has(path.join(dist, 'item', 'nested'))).toBe(false);
});

test('publishes a file-to-directory transition regardless of mutation order', () => {
  put(path.join(dist, 'item'), 'old');
  applyCommitPlan({
    kind: 'apply-mutations',
    rootDir: dist,
    mutations: [
      { kind: 'write', path: 'item/nested/child.txt', content: 'new' },
      { kind: 'delete', path: 'item' },
    ],
  });
  expect(entries.get(path.join(dist, 'item', 'nested', 'child.txt'))).toBe(
    'new',
  );
});

test('restores deleted nested directories after a later publication failure', () => {
  put(path.join(dist, 'item', 'nested', 'child.txt'), 'old');
  put(path.join(dist, 'blocked', 'keep.txt'), 'unrelated');
  const before = snapshot();
  expect(() =>
    applyCommitPlan({
      kind: 'apply-mutations',
      rootDir: dist,
      mutations: [
        { kind: 'write', path: 'item', content: 'new' },
        { kind: 'delete', path: 'item/nested/child.txt' },
        { kind: 'write', path: 'blocked', content: 'fail' },
      ],
    }),
  ).toThrow('Cannot publish file mutation over directory');
  expect(snapshot()).toEqual(before);
});
