import fs from 'fs';
import path from 'path';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import {
  addGeneratedRouteAliases,
  getProcessedExts,
  getSourceOutputPaths,
  getSourceTargetPaths,
  scanProject,
  updateProjectScan,
} from './source-model';
import type { SiteVariables } from './types';

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

const initDir = path.resolve(import.meta.dir, '..', 'init');

function makeBatch(
  changes: Array<{ path: string; kind: 'add' | 'change' | 'unlink' }>,
): { changes: Array<{ path: string; kind: 'add' | 'change' | 'unlink' }> } {
  return { changes };
}

describe('getSourceOutputPaths', () => {
  const contentDir = '/tmp/site/content';
  const processedExts = getProcessedExts(['ts']);

  test('derives markdown output paths', () => {
    expect(
      getSourceOutputPaths({
        contentDir,
        filePath: '/tmp/site/content/about.md',
        processedExts,
        buildContent: true,
      }),
    ).toEqual(new Set(['about.html']));
  });

  test('derives code output paths for raw and rendered outputs', () => {
    expect(
      getSourceOutputPaths({
        contentDir,
        filePath: '/tmp/site/content/examples/hello.ts',
        processedExts,
        buildContent: true,
      }),
    ).toEqual(new Set(['examples/hello.ts', 'examples/hello.ts.html']));
  });

  test('preserves copied asset paths without rendered aliases', () => {
    expect(
      getSourceOutputPaths({
        contentDir,
        filePath: '/tmp/site/content/assets/logo.svg',
        processedExts,
        buildContent: true,
      }),
    ).toEqual(new Set(['assets/logo.svg']));
  });
});

describe('getSourceTargetPaths', () => {
  const processedExts = getProcessedExts(['ts']);

  test('adds index aliases for markdown and html content pages', () => {
    expect(
      getSourceTargetPaths({
        kind: 'content',
        rootDir: '/tmp/site/content',
        filePath: '/tmp/site/content/guides/index.md',
        processedExts,
        buildContent: true,
      }),
    ).toEqual(new Set(['/guides/index.html', '/guides/', '/guides']));

    expect(
      getSourceTargetPaths({
        kind: 'content',
        rootDir: '/tmp/site/content',
        filePath: '/tmp/site/content/docs/index.html',
        processedExts,
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
        processedExts,
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
        processedExts,
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
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    process.chdir(initDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
  });

  test('scans existing project fixtures into shared owners and targets', () => {
    const homePath = path.join(initDir, 'content', 'index.md');
    const partialPath = path.join(
      initDir,
      'content',
      'lectures',
      '02',
      '_pr1.md',
    );
    const literateJavaPath = path.join(
      initDir,
      'content',
      'labs',
      '00',
      'VowelCounter.java.md',
    );
    const codePath = path.join(
      initDir,
      'content',
      'labs',
      '01',
      'SearchTreeDemo.java',
    );
    const publicPath = path.join(initDir, 'public', 'test.txt');
    const publicImagePath = path.join(initDir, 'public', 'avatars', 'alex.jpg');
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
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    process.chdir(initDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
  });

  test('applies add change and unlink updates without mutating the snapshot', () => {
    const removedContentPath = path.join(initDir, 'content', 'markdown.md');
    const removedPublicPath = path.join(initDir, 'public', 'test.txt');
    const changedCodePath = path.join(
      initDir,
      'content',
      'labs',
      '01',
      'SearchTreeDemo.java',
    );
    const addedContentPath = path.join(initDir, 'content', 'docs', 'index.md');
    const addedPublicPath = path.join(initDir, 'public', 'assets', 'logo.svg');
    const snapshot = scanProject(siteVariables);
    const mutableFs = fs as {
      existsSync: typeof fs.existsSync;
      statSync: typeof fs.statSync;
      readFileSync: typeof fs.readFileSync;
    };
    const originalExistsSync = mutableFs.existsSync;
    const originalStatSync = mutableFs.statSync;
    const originalReadFileSync = mutableFs.readFileSync;

    const normalizePathLike = (filePath: string | Buffer | URL): string =>
      path.resolve(filePath.toString());

    mutableFs.existsSync = ((filePath: string | Buffer | URL) => {
      const resolvedPath = normalizePathLike(filePath);
      if (
        resolvedPath === removedContentPath ||
        resolvedPath === removedPublicPath
      ) {
        return false;
      }
      if (
        resolvedPath === addedContentPath ||
        resolvedPath === addedPublicPath
      ) {
        return true;
      }
      return originalExistsSync(filePath);
    }) as unknown as typeof fs.existsSync;

    mutableFs.statSync = ((filePath: string | Buffer | URL) => {
      const resolvedPath = normalizePathLike(filePath);
      if (
        resolvedPath === addedContentPath ||
        resolvedPath === addedPublicPath
      ) {
        return { isFile: () => true } as fs.Stats;
      }
      return originalStatSync(filePath);
    }) as unknown as typeof fs.statSync;

    mutableFs.readFileSync = ((
      filePath: string | Buffer | URL,
      encoding?: unknown,
    ) => {
      if (
        normalizePathLike(filePath) === addedContentPath &&
        encoding === 'utf-8'
      ) {
        return '# Docs';
      }
      return originalReadFileSync(filePath, encoding as BufferEncoding);
    }) as unknown as typeof fs.readFileSync;

    try {
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
      expect(updated.contentOwners.get('docs/index.html')).toBe(
        addedContentPath,
      );
      expect(updated.publicOwners.get('assets/logo.svg')).toBe(addedPublicPath);
      expect(updated.validTargets.has('/docs/index.html')).toBe(true);
      expect(updated.validTargets.has('/docs/')).toBe(true);
      expect(updated.validTargets.has('/docs')).toBe(true);
      expect(updated.validTargets.has('/assets/logo.svg')).toBe(true);
      expect(updated.validTargets.has('/labs/01/SearchTreeDemo.java')).toBe(
        true,
      );
    } finally {
      mutableFs.existsSync = originalExistsSync;
      mutableFs.statSync = originalStatSync;
      mutableFs.readFileSync = originalReadFileSync;
    }
  });
});
