import type fs from 'fs';
import path from 'path';
import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { createGlobals } from './globals.test';
import { createFsModuleMock } from './test-helpers';
import { createContentRecord, createPublicRecord } from './source-records';
import {
  getSourceRenderKind,
  indexSources,
  type TadaProjectScan,
  type TadaSourceRenderKind,
} from './source-model';
import type { SiteVariables } from './types';

const SITE_ROOT = path.resolve(path.sep, 'site');

const siteVariables = {
  base: 'http://localhost',
  basePath: '/',
  title: 'Site',
  titlePostfix: ' - Site',
  themeColor: 'black',
  defaultTimeZone: 'America/New_York',
  features: { search: true, favicon: true, footer: true, pickers: true },
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

  mock.module('fs', () => createFsModuleMock({ readFileSync }));
}

beforeEach(() => {
  mockFs({});
  mock.module('./globals', () => ({ globals: createGlobals() }));
});

function makeScan(
  filePath: string,
  renderKind: TadaSourceRenderKind,
  contentDir = sitePath('content'),
): TadaProjectScan {
  return indexSources(
    {
      contentDir,
      publicDir: sitePath('public'),
      distDir: sitePath('dist'),
      processedExts: new Set(['md', 'html', 'ts', 'java']),
    },
    new Map([
      [
        filePath,
        { kind: 'content', renderKind, outputs: new Set(), targets: new Set() },
      ],
    ]),
  );
}

describe('source render classification', () => {
  test.each([
    ['hello.ts', 'content', true, 'code-page'],
    ['Counter.java.md', 'content', true, 'literate-java'],
    ['_Partial.java.md', 'content', false, 'skip'],
    ['Excluded.java.md', 'content', false, 'skip'],
    ['logo.svg', 'public', false, 'public-copy'],
    ['logo.svg', 'content', false, 'content-copy'],
    ['_partial.md', 'content', false, 'skip'],
    ['index.md', 'content', true, 'plain-text-page'],
  ] as const)('%s (%s) renders as %s', (name, kind, buildContent, expected) => {
    expect(
      getSourceRenderKind(
        name,
        kind,
        new Set(['md', 'html', 'ts', 'java']),
        buildContent,
      ),
    ).toBe(expected);
  });
});

describe('createContentRecord', () => {
  test('returns an empty record for excluded literate Java sources', () => {
    const filePath = sitePath('content', 'java', 'Excluded.java.md');
    const scan = makeScan(filePath, 'skip');

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
    const scan = makeScan(filePath, 'content-copy', contentDir);

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
