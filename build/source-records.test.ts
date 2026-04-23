import type fs from 'fs';
import path from 'path';
import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { createGlobals } from './globals.test';
import {
  classifySourceRenderKind,
  createContentRecord,
  createPublicRecord,
  type TadaSourceRenderKind,
} from './source-records';
import type { TadaProjectScan } from './source-model';
import type { SiteVariables } from './types';

const SITE_ROOT = path.resolve(path.sep, 'site');

const siteVariables = {
  base: 'http://localhost',
  basePath: '/',
  title: 'Site',
  titlePostfix: ' - Site',
  themeColor: 'black',
  defaultTimeZone: 'America/New_York',
  features: { search: true, favicon: true, footer: true },
  extensionToShikiLanguage: { ts: 'ts', java: 'java' },
} as SiteVariables;

function sitePath(...parts: string[]): string {
  return path.join(SITE_ROOT, ...parts);
}

function mockFs(files: Record<string, Buffer>): void {
  const readFileSync = ((filePath: fs.PathLike) => {
    const resolvedPath = path.resolve(String(filePath));
    const file = files[resolvedPath];
    if (!file) {
      throw new Error(`Unexpected readFileSync: ${resolvedPath}`);
    }
    return file;
  }) as typeof import('fs').readFileSync;

  mock.module('fs', () => ({ default: { readFileSync }, readFileSync }));
}

beforeEach(() => {
  mockFs({});
  mock.module('./globals', () => ({ globals: createGlobals() }));
});

function makeScan(overrides: Partial<TadaProjectScan> = {}): TadaProjectScan {
  return {
    contentDir: sitePath('content'),
    publicDir: sitePath('public'),
    distDir: sitePath('dist'),
    contentFiles: new Set(),
    buildContentFiles: new Set(),
    publicFiles: new Set(),
    validTargets: new Set(),
    literateJavaOutputPaths: new Set(),
    processedExts: new Set(['md', 'markdown', 'html', 'ts', 'java']),
    contentOwners: new Map(),
    publicOwners: new Map(),
    sourceOutputPaths: new Map(),
    sourceTargetPaths: new Map(),
    ...overrides,
  };
}

function expectRenderKind(
  filePath: string,
  scan: TadaProjectScan,
  expected: TadaSourceRenderKind,
): void {
  expect(classifySourceRenderKind({ filePath, scan, siteVariables })).toBe(
    expected,
  );
}

describe('classifySourceRenderKind', () => {
  test('classifies content code pages', () => {
    const filePath = sitePath('content', 'examples', 'hello.ts');
    const scan = makeScan({
      contentFiles: new Set([filePath]),
      buildContentFiles: new Set([filePath]),
    });

    expectRenderKind(filePath, scan, 'code-page');
  });

  test('classifies literate Java pages', () => {
    const filePath = sitePath('content', 'java', 'Counter.java.md');
    const scan = makeScan({
      contentFiles: new Set([filePath]),
      buildContentFiles: new Set([filePath]),
    });

    expectRenderKind(filePath, scan, 'literate-java');
  });

  test('skips literate Java partials that are not build inputs', () => {
    const filePath = sitePath('content', 'java', '_Partial.java.md');
    const scan = makeScan({ contentFiles: new Set([filePath]) });

    expectRenderKind(filePath, scan, 'skip');
  });

  test('skips excluded literate Java sources that are not build inputs', () => {
    const filePath = sitePath('content', 'java', 'Excluded.java.md');
    const scan = makeScan({ contentFiles: new Set([filePath]) });

    expectRenderKind(filePath, scan, 'skip');
  });

  test('classifies public files as copied assets', () => {
    const filePath = sitePath('public', 'images', 'logo.svg');
    const scan = makeScan({ publicFiles: new Set([filePath]) });

    expectRenderKind(filePath, scan, 'public-copy');
  });

  test('classifies raw content assets as copied assets', () => {
    const filePath = sitePath('content', 'images', 'logo.svg');
    const scan = makeScan({ contentFiles: new Set([filePath]) });

    expectRenderKind(filePath, scan, 'content-copy');
  });

  test('skips processed content sources that are not build inputs', () => {
    const filePath = sitePath('content', '_partial.md');
    const scan = makeScan({ contentFiles: new Set([filePath]) });

    expectRenderKind(filePath, scan, 'skip');
  });

  test('classifies markdown pages as plain text pages', () => {
    const filePath = sitePath('content', 'notes', 'index.md');
    const scan = makeScan({
      contentFiles: new Set([filePath]),
      buildContentFiles: new Set([filePath]),
    });

    expectRenderKind(filePath, scan, 'plain-text-page');
  });
});

describe('createContentRecord', () => {
  test('returns an empty record for excluded literate Java sources', () => {
    const filePath = sitePath('content', 'java', 'Excluded.java.md');
    const scan = makeScan({ contentFiles: new Set([filePath]) });

    const record = createContentRecord({
      filePath,
      siteVariables,
      scan,
      assetFiles: [],
      outputDir: sitePath('dist'),
    });

    expect(record).toEqual({
      sourcePath: filePath,
      kind: 'content',
      outputs: new Map(),
      htmlAnalysisByOutputPath: new Map(),
      partialDeps: new Set(),
      traceDeps: new Set(),
      internalTargets: new Set(),
      generatedOutputPaths: new Set(),
    });
  });

  test('copies raw content assets without invoking page rendering', () => {
    const contentDir = path.resolve('init/public');
    const filePath = path.join(contentDir, 'test.txt');
    const fileContent = Buffer.from('copied raw asset');
    mockFs({ [path.resolve(filePath)]: fileContent });
    const scan = makeScan({ contentDir, contentFiles: new Set([filePath]) });

    const record = createContentRecord({
      filePath,
      siteVariables,
      scan,
      assetFiles: [],
      outputDir: sitePath('dist'),
    });

    expect(record.sourcePath).toBe(filePath);
    expect(record.kind).toBe('content');
    expect(record.outputs).toEqual(new Map([['test.txt', fileContent]]));
    expect(record.htmlAnalysisByOutputPath).toEqual(new Map());
    expect(record.partialDeps).toEqual(new Set());
    expect(record.traceDeps).toEqual(new Set());
    expect(record.internalTargets).toEqual(new Set());
    expect(record.generatedOutputPaths).toEqual(new Set());
    expect(record.authorKey).toBeUndefined();
  });
});

describe('createPublicRecord', () => {
  test('reads public files into output records', () => {
    const publicDir = path.resolve('init/public');
    const filePath = path.join(publicDir, 'test.txt');
    const fileContent = Buffer.from('copied public asset');
    mockFs({ [path.resolve(filePath)]: fileContent });

    const record = createPublicRecord(filePath, publicDir);

    expect(record).toEqual({
      sourcePath: filePath,
      kind: 'public',
      outputs: new Map([['test.txt', fileContent]]),
      htmlAnalysisByOutputPath: new Map(),
      partialDeps: new Set(),
      traceDeps: new Set(),
      internalTargets: new Set(),
      generatedOutputPaths: new Set(),
    });
  });
});
