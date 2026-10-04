import { beforeEach, describe, expect, mock, test } from 'bun:test';
import path from 'node:path';
import { createGlobals } from './globals.test';
import { createFsModuleMock } from './test-helpers';
import type { OutputFile } from './output-publication';

// In-memory filesystem: directories are null, files hold their text.
const entries = new Map<string, string | null>();
const symlinks = new Set<string>();
const busyFailures = new Map<string, number>();
const root = path.resolve('publication-fixture');
const dist = path.join(root, 'dist');

function fsError(code: string, file: string): never {
  throw Object.assign(new Error(`${code}: ${file}`), { code });
}

function mkdir(dir: string): void {
  if (entries.get(dir) === null) {
    return;
  }
  if (entries.has(dir)) {
    fsError('ENOTDIR', dir);
  }
  if (path.dirname(dir) !== dir) {
    mkdir(path.dirname(dir));
  }
  entries.set(dir, null);
}

function put(file: string, content: string): void {
  mkdir(path.dirname(file));
  entries.set(file, content);
}

function failWhileBusy(file: string): void {
  const remaining = busyFailures.get(file) ?? 0;
  if (remaining > 0) {
    busyFailures.set(file, remaining - 1);
    fsError('EBUSY', file);
  }
}

function writeFile(file: string, content: string): void {
  failWhileBusy(file);
  if (entries.get(file) === null) {
    fsError('EISDIR', file);
  }
  if (entries.get(path.dirname(file)) !== null) {
    fsError('ENOENT', file);
  }
  entries.set(file, content);
}

function files(): Record<string, string> {
  return Object.fromEntries(
    [...entries]
      .filter(([file, content]) => content !== null && file.startsWith(dist))
      .map(([file, content]) => [
        path.relative(dist, file).split(path.sep).join('/'),
        content,
      ])
      .sort(),
  );
}

function dirs(): string[] {
  return [...entries]
    .filter(([dir, content]) => content === null && dir.startsWith(dist))
    .map(([dir]) => path.relative(dist, dir).split(path.sep).join('/'))
    .sort();
}

mock.module('fs', () =>
  createFsModuleMock({
    existsSync: (file: string) => entries.has(file),
    lstatSync: (file: string) =>
      entries.has(file)
        ? {
            isDirectory: () =>
              entries.get(file) === null && !symlinks.has(file),
            isSymbolicLink: () => symlinks.has(file),
          }
        : undefined,
    mkdirSync(dir: string) {
      mkdir(dir);
    },
    writeFileSync(file: string, content: string | Uint8Array) {
      writeFile(file, String(content));
    },
    copyFileSync(source: string, target: string) {
      const content = entries.get(source);
      if (typeof content !== 'string') {
        fsError('ENOENT', source);
      }
      writeFile(target, content);
    },
    rmSync(file: string) {
      failWhileBusy(file);
      if (entries.get(file) === null) {
        fsError('EISDIR', file);
      }
      entries.delete(file);
    },
    rmdirSync(dir: string) {
      if (entries.get(dir) !== null) {
        fsError('ENOTDIR', dir);
      }
      if ([...entries.keys()].some(file => file.startsWith(dir + path.sep))) {
        fsError('ENOTEMPTY', dir);
      }
      entries.delete(dir);
    },
    readdirSync(dir: string) {
      return [...entries]
        .filter(([file]) => path.dirname(file) === dir && file !== dir)
        .map(([file, content]) => ({
          name: path.basename(file),
          isDirectory: () => content === null && !symlinks.has(file),
        }));
    },
  }),
);
mock.module('./globals', () => ({
  globals: createGlobals({ sleepSync: () => {} }),
}));

const { applyMutations, computeMutations, planFullWrite, writeOutputFile } =
  await import('./output-publication');

function outputs(
  values: Record<string, OutputFile['content']>,
  sourcePath = '/source',
): Map<string, OutputFile> {
  return new Map(
    Object.entries(values).map(([outputPath, content]) => [
      outputPath,
      { sourcePath, content },
    ]),
  );
}

beforeEach(() => {
  entries.clear();
  symlinks.clear();
  busyFailures.clear();
  mkdir(dist);
});

describe('applyMutations', () => {
  test('writes new and changed files and deletes removed ones in place', () => {
    put(path.join(dist, 'keep.html'), 'old');
    put(path.join(dist, 'gone', 'page.html'), 'gone');

    applyMutations(dist, [
      { kind: 'write', path: 'keep.html', content: 'new' },
      { kind: 'write', path: 'docs/index.html', content: 'docs' },
      { kind: 'delete', path: 'gone/page.html' },
    ]);

    expect(files()).toEqual({ 'docs/index.html': 'docs', 'keep.html': 'new' });
    expect(dirs()).toEqual(['', 'docs']);
  });

  test('replaces a file with a directory and a directory with a file', () => {
    put(path.join(dist, 'notes'), 'file');
    put(path.join(dist, 'about', 'index.html'), 'nested');

    applyMutations(dist, [
      { kind: 'write', path: 'notes/index.html', content: 'nested' },
      { kind: 'write', path: 'about', content: 'file' },
      { kind: 'delete', path: 'notes' },
      { kind: 'delete', path: 'about/index.html' },
    ]);

    expect(files()).toEqual({ about: 'file', 'notes/index.html': 'nested' });
  });

  test('leaves unrelated files in a directory it cannot remove', () => {
    put(path.join(dist, 'docs', 'old.html'), 'old');
    put(path.join(dist, 'docs', 'unrelated.txt'), 'kept');

    applyMutations(dist, [{ kind: 'delete', path: 'docs/old.html' }]);

    expect(files()).toEqual({ 'docs/unrelated.txt': 'kept' });
  });

  test('retries a file that is briefly busy', () => {
    busyFailures.set(path.join(dist, 'page.html'), 2);

    applyMutations(dist, [
      { kind: 'write', path: 'page.html', content: 'written' },
    ]);

    expect(files()).toEqual({ 'page.html': 'written' });
  });

  test('throws when a file stays busy, keeping earlier writes', () => {
    busyFailures.set(path.join(dist, 'b.html'), 100);

    expect(() =>
      applyMutations(dist, [
        { kind: 'write', path: 'a.html', content: 'a' },
        { kind: 'write', path: 'b.html', content: 'b' },
      ]),
    ).toThrow('EBUSY');
    expect(files()).toEqual({ 'a.html': 'a' });
  });
});

describe('applyMutations through symbolic links', () => {
  test('refuses to write or delete through a symbolically linked directory', () => {
    mkdir(path.join(dist, 'media'));
    symlinks.add(path.join(dist, 'media'));

    expect(() =>
      applyMutations(dist, [
        { kind: 'write', path: 'media/photo.png', content: 'x' },
      ]),
    ).toThrow('symbolic link');
    expect(() =>
      applyMutations(dist, [{ kind: 'delete', path: 'media/photo.png' }]),
    ).toThrow('symbolic link');
  });
});

describe('writeOutputFile', () => {
  test('copies referenced files and writes text', () => {
    put(path.join(root, 'public', 'logo.svg'), '<svg/>');

    writeOutputFile(path.join(dist, 'img', 'logo.svg'), {
      copyFrom: path.join(root, 'public', 'logo.svg'),
    });
    writeOutputFile(path.join(dist, 'index.html'), 'home');

    expect(files()).toEqual({ 'img/logo.svg': '<svg/>', 'index.html': 'home' });
  });
});

describe('planFullWrite', () => {
  test('writes every output and deletes other files except kept prefixes', () => {
    put(path.join(dist, 'index.html'), 'old');
    put(path.join(dist, 'stale.html'), 'stale');
    put(path.join(dist, 'pagefind', 'index.js'), 'search');

    expect(
      planFullWrite(dist, outputs({ 'index.html': 'new' }), ['pagefind/']),
    ).toEqual([
      { kind: 'delete', path: 'stale.html' },
      { kind: 'write', path: 'index.html', content: 'new' },
    ]);
  });

  test('removes stale empty directories, including one in the way of an output', () => {
    mkdir(path.join(dist, 'about.html', 'empty'));
    mkdir(path.join(dist, 'unused'));
    put(path.join(dist, 'pagefind', 'index.js'), 'search');
    mkdir(path.join(dist, 'pagefind', 'fragments'));

    const mutations = planFullWrite(dist, outputs({ 'about.html': 'about' }), [
      'pagefind/',
    ]);
    applyMutations(dist, mutations);

    expect(files()).toEqual({
      'about.html': 'about',
      'pagefind/index.js': 'search',
    });
    expect(dirs()).toEqual(['', 'pagefind', 'pagefind/fragments']);
  });

  test('lists a symbolic link as a file and never looks inside it', () => {
    put(path.join(dist, 'index.html'), 'old');
    mkdir(path.join(dist, 'media'));
    symlinks.add(path.join(dist, 'media'));
    put(path.join(dist, 'media', 'precious.txt'), 'outside');

    expect(planFullWrite(dist, outputs({ 'index.html': 'new' }))).toEqual([
      { kind: 'delete', path: 'media' },
      { kind: 'write', path: 'index.html', content: 'new' },
    ]);
  });

  test('writes everything into a directory that does not exist yet', () => {
    expect(
      planFullWrite(path.join(root, 'v1'), outputs({ 'a.html': 'a' })),
    ).toEqual([{ kind: 'write', path: 'a.html', content: 'a' }]);
  });
});

describe('computeMutations', () => {
  test('equal output text needs no write unless the source was rebuilt', () => {
    const same = outputs({ output: 'same' });
    expect(computeMutations(same, outputs({ output: 'same' }))).toEqual([]);
    expect(
      computeMutations(same, outputs({ output: 'same' }), new Set(['/source'])),
    ).toEqual([{ kind: 'write', path: 'output', content: 'same' }]);
  });

  test('copied outputs are rewritten only when their source path changes or is rebuilt', () => {
    const copy = { copyFrom: '/site/public/logo.png' };
    const moved = { copyFrom: '/site/content/logo.png' };
    expect(
      computeMutations(
        outputs({ output: copy }),
        outputs({ output: { ...copy } }),
      ),
    ).toEqual([]);
    expect(
      computeMutations(
        outputs({ output: copy }),
        outputs({ output: copy }),
        new Set(['/source']),
      ),
    ).toEqual([{ kind: 'write', path: 'output', content: copy }]);
    expect(
      computeMutations(outputs({ output: copy }), outputs({ output: moved })),
    ).toEqual([{ kind: 'write', path: 'output', content: moved }]);
  });

  test('bytes compare by value', () => {
    expect(
      computeMutations(
        outputs({ output: new Uint8Array([1, 2]) }),
        outputs({ output: new Uint8Array([1, 2]) }),
      ),
    ).toEqual([]);
    expect(
      computeMutations(
        outputs({ output: new Uint8Array([1, 2]) }),
        outputs({ output: new Uint8Array([1, 3]) }),
      ),
    ).toEqual([
      { kind: 'write', path: 'output', content: new Uint8Array([1, 3]) },
    ]);
  });

  test('removed and new outputs produce deletes and writes', () => {
    expect(computeMutations(outputs({ output: 'before' }), new Map())).toEqual([
      { kind: 'delete', path: 'output' },
    ]);
    expect(computeMutations(new Map(), outputs({ output: 'new' }))).toEqual([
      { kind: 'write', path: 'output', content: 'new' },
    ]);
  });
});
