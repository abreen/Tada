import { beforeAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import path from 'path';
import { createGlobals } from './globals.test';
import { createFsModuleMock } from './test-helpers';
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
  features: { search: true, favicon: true, footer: true },
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
      return { isDirectory: () => false, isFile: () => true };
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
let scanProject: typeof import('./source-model').scanProject;
let updateProjectScan: typeof import('./source-model').updateProjectScan;

beforeAll(async () => {
  ({
    addGeneratedRouteAliases,
    getProcessedExts,
    getSourceOutputPaths,
    getSourceTargetPaths,
    scanProject,
    updateProjectScan,
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

function makeBatch(
  changes: Array<{ path: string; kind: 'add' | 'change' | 'unlink' }>,
): { changes: Array<{ path: string; kind: 'add' | 'change' | 'unlink' }> } {
  return { changes };
}

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

    expect(scan.contentFiles.has(homePath)).toBe(true);
    expect(scan.contentFiles.has(partialPath)).toBe(true);
    expect(scan.buildContentFiles.has(homePath)).toBe(true);
    expect(scan.buildContentFiles.has(partialPath)).toBe(false);
    expect(scan.buildContentFiles.has(literateJavaPath)).toBe(true);
    expect(scan.buildContentFiles.has(codePath)).toBe(true);
    expect(scan.publicFiles.has(publicPath)).toBe(true);
    expect(scan.sourceOutputPaths.get(codePath)).toEqual(
      new Set([
        'labs/01/SearchTreeDemo.java',
        'labs/01/SearchTreeDemo.java.html',
      ]),
    );
    expect(scan.sourceOutputPaths.get(literateJavaPath)).toEqual(
      new Set(['labs/00/VowelCounter.java.html', 'labs/00/VowelCounter.java']),
    );
    expect(scan.sourceOutputPaths.get(partialPath)).toEqual(new Set());
    expect(scan.sourceTargetPaths.get(literateJavaPath)).toEqual(
      new Set([
        '/labs/00/VowelCounter.java.html',
        '/labs/00/VowelCounter.java',
      ]),
    );
    expect(scan.sourceTargetPaths.get(codePath)).toEqual(
      new Set([
        '/labs/01/SearchTreeDemo.java.html',
        '/labs/01/SearchTreeDemo.java',
      ]),
    );
    expect(scan.sourceTargetPaths.get(publicPath)).toEqual(
      new Set(['/test.txt']),
    );
    expect(scan.contentOwners.get('index.html')).toBe(homePath);
    expect(scan.contentOwners.get('labs/00/VowelCounter.java.html')).toBe(
      literateJavaPath,
    );
    expect(scan.contentOwners.get('labs/01/SearchTreeDemo.java')).toBe(
      codePath,
    );
    expect(scan.publicOwners.get('avatars/alex.jpg')).toBe(publicImagePath);
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

describe('updateProjectScan', () => {
  test('applies add change and unlink updates without mutating the snapshot', () => {
    const removedContentPath = path.join(projectRoot, 'content', 'markdown.md');
    const removedPublicPath = path.join(projectRoot, 'public', 'test.txt');
    const changedCodePath = path.join(
      projectRoot,
      'content',
      'labs',
      '01',
      'SearchTreeDemo.java',
    );
    const addedContentPath = path.join(
      projectRoot,
      'content',
      'docs',
      'index.md',
    );
    const addedPublicPath = path.join(
      projectRoot,
      'public',
      'assets',
      'logo.svg',
    );
    const snapshot = scanProject(siteVariables);

    files.delete(removedContentPath);
    files.delete(removedPublicPath);
    writeFile(addedContentPath, 'title: Docs\n\n# Docs');
    writeFile(addedPublicPath, '<svg></svg>');
    writeFile(changedCodePath, 'class SearchTreeDemo { int nodes = 1; }');

    const updated = updateProjectScan(
      snapshot,
      makeBatch([
        { path: removedContentPath, kind: 'unlink' },
        { path: removedPublicPath, kind: 'unlink' },
        { path: addedContentPath, kind: 'add' },
        { path: addedPublicPath, kind: 'add' },
        { path: changedCodePath, kind: 'change' },
      ]),
    );

    expect(snapshot.contentFiles.has(removedContentPath)).toBe(true);
    expect(snapshot.publicFiles.has(removedPublicPath)).toBe(true);
    expect(snapshot.sourceOutputPaths.get(removedContentPath)).toEqual(
      new Set(['markdown.html']),
    );
    expect(updated.contentFiles.has(removedContentPath)).toBe(false);
    expect(updated.publicFiles.has(removedPublicPath)).toBe(false);
    expect(updated.contentFiles.has(addedContentPath)).toBe(true);
    expect(updated.buildContentFiles.has(addedContentPath)).toBe(true);
    expect(updated.publicFiles.has(addedPublicPath)).toBe(true);
    expect(updated.sourceOutputPaths.get(removedContentPath)).toBeUndefined();
    expect(updated.sourceTargetPaths.get(removedContentPath)).toBeUndefined();
    expect(updated.sourceOutputPaths.get(addedContentPath)).toEqual(
      new Set(['docs/index.html']),
    );
    expect(updated.sourceTargetPaths.get(addedContentPath)).toEqual(
      new Set(['/docs/index.html', '/docs/', '/docs']),
    );
    expect(updated.sourceOutputPaths.get(changedCodePath)).toEqual(
      new Set([
        'labs/01/SearchTreeDemo.java',
        'labs/01/SearchTreeDemo.java.html',
      ]),
    );
    expect(updated.sourceTargetPaths.get(addedPublicPath)).toEqual(
      new Set(['/assets/logo.svg']),
    );
    expect(updated.contentOwners.get('markdown.html')).toBeUndefined();
    expect(updated.publicOwners.get('test.txt')).toBeUndefined();
    expect(updated.contentOwners.get('docs/index.html')).toBe(addedContentPath);
    expect(updated.publicOwners.get('assets/logo.svg')).toBe(addedPublicPath);
    expect(updated.validTargets.has('/docs/index.html')).toBe(true);
    expect(updated.validTargets.has('/docs/')).toBe(true);
    expect(updated.validTargets.has('/docs')).toBe(true);
    expect(updated.validTargets.has('/assets/logo.svg')).toBe(true);
    expect(updated.validTargets.has('/labs/01/SearchTreeDemo.java')).toBe(true);
  });
});
