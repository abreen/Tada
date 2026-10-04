import { beforeAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import path from 'path';
import { createGlobals } from './globals.test';
import { createFsModuleMock } from './test-helpers';
import { sourcePaths } from './source-model';
import type { SiteVariables } from './types';

const projectRoot = path.resolve(path.sep, 'virtual', 'site');
const files = new Map<string, string>();
const directories = new Set<string>();

const siteVariables = {
  base: 'http://localhost',
  basePath: '/',
  title: 'Site',
  titlePostfix: ' - Site',
  themeColor: 'black',
  defaultTimeZone: 'America/New_York',
  features: { search: true, favicon: true, footer: true, pickers: true },
  extensionToShikiLanguage: { java: 'java', py: 'python' },
} as SiteVariables;

function resolvePath(filePath: string): string {
  return path.resolve(filePath);
}

function ensureDirectory(dirPath: string): void {
  let current = resolvePath(dirPath);
  while (!directories.has(current)) {
    directories.add(current);
    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }
}

function writeFile(filePath: string, content: string): void {
  const resolved = resolvePath(filePath);
  ensureDirectory(path.dirname(resolved));
  files.set(resolved, content);
}

function readDirEntries(dirPath: string): string[] {
  const resolvedDir = resolvePath(dirPath);
  if (!directories.has(resolvedDir)) {
    throw new Error(
      `ENOENT: no such file or directory, scandir '${resolvedDir}'`,
    );
  }

  const entries = new Set<string>();
  for (const child of directories) {
    if (path.dirname(child) === resolvedDir && child !== resolvedDir) {
      entries.add(path.basename(child));
    }
  }
  for (const child of files.keys()) {
    if (path.dirname(child) === resolvedDir) {
      entries.add(path.basename(child));
    }
  }
  return [...entries].sort();
}

const fsMock = {
  existsSync(filePath: string) {
    const resolved = resolvePath(filePath);
    return directories.has(resolved) || files.has(resolved);
  },
  readFileSync(filePath: string) {
    const resolved = resolvePath(filePath);
    const content = files.get(resolved);
    if (content === undefined) {
      throw new Error(`ENOENT: no such file or directory, open '${resolved}'`);
    }
    return content;
  },
  readdirSync(dirPath: string, options?: { withFileTypes?: boolean }) {
    const entries = readDirEntries(dirPath);
    if (!options?.withFileTypes) {
      return entries;
    }
    return entries.map(name => {
      const fullPath = path.join(resolvePath(dirPath), name);
      const isDirectory = directories.has(fullPath);
      return {
        name,
        isDirectory: () => isDirectory,
        isFile: () => !isDirectory,
      };
    });
  },
  statSync(filePath: string) {
    const resolved = resolvePath(filePath);
    if (directories.has(resolved)) {
      return { isDirectory: () => true, isFile: () => false };
    }
    if (files.has(resolved)) {
      const content = String(files.get(resolved));
      return {
        isDirectory: () => false,
        isFile: () => true,
        size: content.length,
        // Changes whenever the content changes, like a real modification time
        mtimeMs: [...content].reduce(
          (hash, char) => (hash * 31 + char.charCodeAt(0)) | 0,
          0,
        ),
      };
    }
    throw new Error(`ENOENT: no such file or directory, stat '${resolved}'`);
  },
};

mock.module('fs', () => createFsModuleMock(fsMock));

mock.module('./globals', () => ({
  globals: createGlobals({
    cwd() {
      return projectRoot;
    },
  }),
}));

let addGeneratedRouteAliases: typeof import('./source-model').addGeneratedRouteAliases;
let getProcessedExts: typeof import('./source-model').getProcessedExts;
let getSourceOutputPaths: typeof import('./source-model').getSourceOutputPaths;
let getSourceTargetPaths: typeof import('./source-model').getSourceTargetPaths;
let assertNoOutputPathConflicts: typeof import('./source-model').assertNoOutputPathConflicts;
let scanProject: typeof import('./source-model').scanProject;

beforeAll(async () => {
  ({
    assertNoOutputPathConflicts,
    addGeneratedRouteAliases,
    getProcessedExts,
    getSourceOutputPaths,
    getSourceTargetPaths,
    scanProject,
  } = await import('./source-model'));
});

function seedProject(): void {
  ensureDirectory(projectRoot);
  ensureDirectory(path.join(projectRoot, 'content'));
  ensureDirectory(path.join(projectRoot, 'public'));

  writeFile(
    path.join(projectRoot, 'content', 'index.md'),
    'title: Home\n\n# Home',
  );
  writeFile(
    path.join(projectRoot, 'content', 'markdown.md'),
    'title: Markdown\n\n# Markdown',
  );
  writeFile(
    path.join(projectRoot, 'content', 'lectures', '02', '_pr1.md'),
    '# Partial',
  );
  writeFile(
    path.join(projectRoot, 'content', 'labs', '00', 'VowelCounter.java.md'),
    'title: Vowel Counter\n\n```java\nclass VowelCounter {}\n```',
  );
  writeFile(
    path.join(projectRoot, 'content', 'labs', '01', 'SearchTreeDemo.java'),
    'class SearchTreeDemo {}',
  );
  writeFile(path.join(projectRoot, 'public', 'test.txt'), 'test');
  writeFile(path.join(projectRoot, 'public', 'avatars', 'alex.jpg'), 'jpg');
}

beforeEach(() => {
  files.clear();
  directories.clear();
  seedProject();
});

describe('getSourceOutputPaths', () => {
  const contentDir = '/tmp/site/content';

  test('derives markdown output paths', () => {
    expect(
      getSourceOutputPaths({
        contentDir,
        filePath: '/tmp/site/content/about.md',
        processedExts: getProcessedExts(['ts']),
        buildContent: true,
      }),
    ).toEqual(new Set(['about.html']));
  });

  test('derives code output paths for raw and rendered outputs', () => {
    expect(
      getSourceOutputPaths({
        contentDir,
        filePath: '/tmp/site/content/examples/hello.ts',
        processedExts: getProcessedExts(['ts']),
        buildContent: true,
      }),
    ).toEqual(new Set(['examples/hello.ts', 'examples/hello.ts.html']));
  });

  test('preserves copied asset paths without rendered aliases', () => {
    expect(
      getSourceOutputPaths({
        contentDir,
        filePath: '/tmp/site/content/assets/logo.svg',
        processedExts: getProcessedExts(['ts']),
        buildContent: true,
      }),
    ).toEqual(new Set(['assets/logo.svg']));
  });
});

describe('getSourceTargetPaths', () => {
  test('adds index aliases for markdown and html content pages', () => {
    expect(
      getSourceTargetPaths({
        kind: 'content',
        rootDir: '/tmp/site/content',
        filePath: '/tmp/site/content/guides/index.md',
        processedExts: getProcessedExts(['ts']),
        buildContent: true,
      }),
    ).toEqual(new Set(['/guides/index.html', '/guides/', '/guides']));

    expect(
      getSourceTargetPaths({
        kind: 'content',
        rootDir: '/tmp/site/content',
        filePath: '/tmp/site/content/docs/index.html',
        processedExts: getProcessedExts(['ts']),
        buildContent: true,
      }),
    ).toEqual(new Set(['/docs/index.html', '/docs/', '/docs']));
  });

  test('adds raw and rendered targets for code files', () => {
    expect(
      getSourceTargetPaths({
        kind: 'content',
        rootDir: '/tmp/site/content',
        filePath: '/tmp/site/content/examples/hello.ts',
        processedExts: getProcessedExts(['ts']),
        buildContent: true,
      }),
    ).toEqual(new Set(['/examples/hello.ts.html', '/examples/hello.ts']));
  });

  test('adds literate Java targets', () => {
    expect(
      getSourceTargetPaths({
        kind: 'content',
        rootDir: '/tmp/site/content',
        filePath: '/tmp/site/content/java/VowelCounter.java.md',
        processedExts: getProcessedExts(['java']),
        buildContent: true,
      }),
    ).toEqual(
      new Set(['/java/VowelCounter.java.html', '/java/VowelCounter.java']),
    );
  });

  test('returns no targets for processed content when buildContent is false', () => {
    expect(
      getSourceTargetPaths({
        kind: 'content',
        rootDir: '/tmp/site/content',
        filePath: '/tmp/site/content/about.md',
        processedExts: getProcessedExts(['ts']),
        buildContent: false,
      }),
    ).toEqual(new Set());
  });

  test('keeps public targets to exact output paths only', () => {
    expect(
      getSourceTargetPaths({
        kind: 'public',
        rootDir: '/tmp/site/public',
        filePath: '/tmp/site/public/coverage/index.html',
        processedExts: getProcessedExts([]),
        buildContent: true,
      }),
    ).toEqual(new Set(['/coverage/index.html']));
  });
});

describe('addGeneratedRouteAliases', () => {
  test('adds route aliases for content index pages', () => {
    const targets = new Set<string>();

    addGeneratedRouteAliases(targets, '/lectures/index.html');

    expect(targets).toEqual(
      new Set(['/lectures/index.html', '/lectures/', '/lectures']),
    );
  });
});

describe('scanProject', () => {
  test('scans existing project fixtures into shared owners and targets', () => {
    const homePath = path.join(projectRoot, 'content', 'index.md');
    const partialPath = path.join(
      projectRoot,
      'content',
      'lectures',
      '02',
      '_pr1.md',
    );
    const literateJavaPath = path.join(
      projectRoot,
      'content',
      'labs',
      '00',
      'VowelCounter.java.md',
    );
    const codePath = path.join(
      projectRoot,
      'content',
      'labs',
      '01',
      'SearchTreeDemo.java',
    );
    const publicPath = path.join(projectRoot, 'public', 'test.txt');
    const publicImagePath = path.join(
      projectRoot,
      'public',
      'avatars',
      'alex.jpg',
    );
    const scan = scanProject(siteVariables);

    expect(scan.sources.get(homePath)?.kind === 'content').toBe(true);
    expect(scan.sources.get(partialPath)?.kind === 'content').toBe(true);
    expect(new Set(sourcePaths(scan, 'content', true)).has(homePath)).toBe(
      true,
    );
    expect(new Set(sourcePaths(scan, 'content', true)).has(partialPath)).toBe(
      false,
    );
    expect(
      new Set(sourcePaths(scan, 'content', true)).has(literateJavaPath),
    ).toBe(true);
    expect(new Set(sourcePaths(scan, 'content', true)).has(codePath)).toBe(
      true,
    );
    expect(scan.sources.get(publicPath)?.kind === 'public').toBe(true);
    expect(scan.sources.get(codePath)?.outputs).toEqual(
      new Set([
        'labs/01/SearchTreeDemo.java',
        'labs/01/SearchTreeDemo.java.html',
      ]),
    );
    expect(scan.sources.get(literateJavaPath)?.outputs).toEqual(
      new Set(['labs/00/VowelCounter.java.html', 'labs/00/VowelCounter.java']),
    );
    expect(scan.sources.get(partialPath)?.outputs).toEqual(new Set());
    expect(scan.generatedPageTargets.has('/')).toBe(true);
    expect(scan.generatedPageTargets.has('/index.html')).toBe(true);
    expect(
      scan.generatedPageTargets.has('/labs/01/SearchTreeDemo.java.html'),
    ).toBe(true);
    expect(scan.generatedPageTargets.has('/labs/01/SearchTreeDemo.java')).toBe(
      false,
    );
    expect(scan.generatedPageTargets.has('/test.txt')).toBe(false);
    expect(scan.sources.get(literateJavaPath)?.targets).toEqual(
      new Set([
        '/labs/00/VowelCounter.java.html',
        '/labs/00/VowelCounter.java',
      ]),
    );
    expect(scan.sources.get(codePath)?.targets).toEqual(
      new Set([
        '/labs/01/SearchTreeDemo.java.html',
        '/labs/01/SearchTreeDemo.java',
      ]),
    );
    expect(scan.sources.get(publicPath)?.targets).toEqual(
      new Set(['/test.txt']),
    );
    expect(scan.outputProducers.get('index.html')?.values().next().value).toBe(
      homePath,
    );
    expect(
      scan.outputProducers
        .get('labs/00/VowelCounter.java.html')
        ?.values()
        .next().value,
    ).toBe(literateJavaPath);
    expect(
      scan.outputProducers.get('labs/01/SearchTreeDemo.java')?.values().next()
        .value,
    ).toBe(codePath);
    expect(
      scan.outputProducers.get('avatars/alex.jpg')?.values().next().value,
    ).toBe(publicImagePath);
    expect(scan.literateJavaOutputPaths.has('/labs/00/VowelCounter.java')).toBe(
      true,
    );
    expect(scan.validTargets.has('/labs/00/VowelCounter.java.html')).toBe(true);
    expect(scan.validTargets.has('/labs/00/VowelCounter.java')).toBe(true);
    expect(scan.validTargets.has('/labs/01/SearchTreeDemo.java.html')).toBe(
      true,
    );
    expect(scan.validTargets.has('/test.txt')).toBe(true);
  });
});

describe('content output conflicts', () => {
  test('a rescan after removing either conflicting source leaves the survivor', () => {
    const markdown = path.join(projectRoot, 'content', 'about.md');
    const html = path.join(projectRoot, 'content', 'about.html');
    writeFile(markdown, '# Markdown');
    writeFile(html, '<p>HTML</p>');
    expect(assertNoOutputPathConflicts(scanProject(siteVariables))).toContain(
      'about.html',
    );
    for (const [removed, survivor] of [
      [markdown, html],
      [html, markdown],
    ]) {
      const content = files.get(removed)!;
      files.delete(removed);
      const recovered = scanProject(siteVariables);
      expect(assertNoOutputPathConflicts(recovered)).not.toContain(
        'about.html',
      );
      expect(
        recovered.outputProducers.get('about.html')?.values().next().value,
      ).toBe(survivor);
      files.set(removed, content);
    }
  });
  test('detects generated code pages and downloadable raw source collisions', () => {
    for (const [name, content] of [
      ['demo.py', 'print(1)'],
      ['demo.py.html', '<p>Page</p>'],
      ['Demo.java.md', '# Literate'],
      ['Demo.java', 'class Demo {}'],
    ]) {
      writeFile(path.join(projectRoot, 'content', name), content);
    }
    expect(assertNoOutputPathConflicts(scanProject(siteVariables))).toEqual([
      'Demo.java',
      'Demo.java.html',
      'demo.py.html',
    ]);
  });
});

test('detects raw copied source conflicts without configured code processing', () => {
  writeFile(path.join(projectRoot, 'content', 'Demo.java.md'), '# Literate');
  writeFile(path.join(projectRoot, 'content', 'Demo.java'), 'class Demo {}');
  expect(
    assertNoOutputPathConflicts(
      scanProject({ ...siteVariables, extensionToShikiLanguage: {} }),
    ),
  ).toEqual(['Demo.java']);
});
