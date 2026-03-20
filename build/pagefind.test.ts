import path from 'path';
import { describe, expect, test } from 'bun:test';
import { buildIndex, collectIndexTargets } from './pagefind.js';
import type { SiteVariables } from './types.js';

interface FakePagefindCalls {
  htmlFiles?: { sourcePath: string; content: string }[];
  customRecords?: {
    url: string;
    content: string;
    language: string;
    meta: Record<string, string>;
  }[];
  outputPath?: string | null;
  deleted?: number;
}

function createFakePagefind(calls: FakePagefindCalls) {
  const fakeIndex = {
    addHTMLFile: async (file: { sourcePath: string; content: string }) => {
      calls.htmlFiles?.push(file);
      return { errors: [], file: { url: file.sourcePath, meta: {} } };
    },
    addCustomRecord: async (record: {
      url: string;
      content: string;
      language: string;
      meta: Record<string, string>;
    }) => {
      calls.customRecords?.push(record);
      return { errors: [], file: { url: record.url, meta: record.meta } };
    },
    writeFiles: async ({ outputPath }: { outputPath: string }) => {
      calls.outputPath = outputPath;
      return { errors: [], outputPath };
    },
    deleteIndex: async () => {
      calls.deleted = (calls.deleted || 0) + 1;
    },
  };

  return (() =>
    Promise.resolve({
      createIndex: async () => ({ index: fakeIndex, errors: [] }),
    })) as unknown as () => Promise<typeof import('pagefind')>;
}

describe('PagefindPlugin', () => {
  test('collectIndexTargets only includes linked PDFs from reachable HTML pages', () => {
    const htmlAssetsByPath = new Map([
      [
        'index.html',
        '<a href="/about/">About</a><a href="/docs/guide.pdf">Guide</a>',
      ],
      ['about/index.html', '<p>About</p>'],
      ['orphan/index.html', '<p>Orphan</p>'],
    ]);
    const pdfSourceByOutputPath = new Map([
      ['/docs/guide.pdf', '/tmp/docs/guide.pdf'],
      ['/docs/orphan.pdf', '/tmp/docs/orphan.pdf'],
    ]);

    const result = collectIndexTargets(
      htmlAssetsByPath,
      { base: '', basePath: '/' } as SiteVariables,
      pdfSourceByOutputPath,
    );

    expect(result).toEqual({
      reachableHtmlPaths: ['about/index.html', 'index.html'],
      reachablePdfPaths: ['/docs/guide.pdf'],
    });
  });

  test('buildIndex adds HTML files and per-page PDF custom records', async () => {
    const calls: FakePagefindCalls = {
      htmlFiles: [],
      customRecords: [],
      outputPath: null,
    };

    await buildIndex({
      distPath: '/tmp/dist',
      htmlAssetsByPath: new Map([
        ['index.html', '<html><body>Home</body></html>'],
        ['about/index.html', '<html><body>About</body></html>'],
      ]),
      reachableHtmlPaths: ['index.html', 'about/index.html'],
      reachablePdfPaths: ['/docs/guide.pdf'],
      pdfSourceByOutputPath: new Map([
        ['/docs/guide.pdf', '/tmp/docs/guide.pdf'],
      ]),
      loadPagefind: createFakePagefind(calls),
      checkMutool: async () => {},
      extractPages: async filePath => ({
        pages: [
          { pageNumber: 2, content: `EXTRACTED:${path.basename(filePath)}:2` },
          { pageNumber: 5, content: `EXTRACTED:${path.basename(filePath)}:5` },
        ],
        hasExtractedText: true,
      }),
    });

    expect(calls.htmlFiles).toEqual([
      { sourcePath: 'index.html', content: '<html><body>Home</body></html>' },
      {
        sourcePath: 'about/index.html',
        content: '<html><body>About</body></html>',
      },
    ]);
    expect(calls.customRecords).toEqual([
      {
        url: '/docs/guide.pdf#page=2',
        content: 'EXTRACTED:guide.pdf:2',
        language: 'en',
        meta: { title: 'guide.pdf', page: '2' },
      },
      {
        url: '/docs/guide.pdf#page=5',
        content: 'EXTRACTED:guide.pdf:5',
        language: 'en',
        meta: { title: 'guide.pdf', page: '5' },
      },
    ]);
    expect(calls.outputPath).toBe('/tmp/dist/pagefind');
    expect(calls.deleted).toBe(1);
  });

  test('buildIndex prepends filename to page 1 content for searchability', async () => {
    const calls: FakePagefindCalls = { htmlFiles: [], customRecords: [] };

    await buildIndex({
      distPath: '/tmp/dist',
      htmlAssetsByPath: new Map(),
      reachableHtmlPaths: [],
      reachablePdfPaths: ['/docs/lecture1.pdf'],
      pdfSourceByOutputPath: new Map([
        ['/docs/lecture1.pdf', '/tmp/docs/lecture1.pdf'],
      ]),
      loadPagefind: createFakePagefind(calls),
      checkMutool: async () => {},
      extractPages: async () => ({
        pages: [
          { pageNumber: 1, content: 'Welcome to the course' },
          { pageNumber: 2, content: 'Chapter one' },
        ],
        hasExtractedText: true,
      }),
    });

    expect(calls.customRecords).toEqual([
      {
        url: '/docs/lecture1.pdf#page=1',
        content: 'lecture1.pdf Welcome to the course',
        language: 'en',
        meta: { title: 'lecture1.pdf', page: '1' },
      },
      {
        url: '/docs/lecture1.pdf#page=2',
        content: 'Chapter one',
        language: 'en',
        meta: { title: 'lecture1.pdf', page: '2' },
      },
    ]);
  });

  test('buildIndex falls back to a single PDF record when text extraction is empty', async () => {
    const calls: FakePagefindCalls = { customRecords: [] };

    await buildIndex({
      distPath: '/tmp/dist',
      htmlAssetsByPath: new Map(),
      reachableHtmlPaths: [],
      reachablePdfPaths: ['/docs/guide.pdf'],
      pdfSourceByOutputPath: new Map([
        ['/docs/guide.pdf', '/tmp/docs/guide.pdf'],
      ]),
      loadPagefind: createFakePagefind(calls),
      checkMutool: async () => {},
      extractPages: async () => ({ pages: [], hasExtractedText: false }),
    });

    expect(calls.customRecords).toEqual([
      {
        url: '/docs/guide.pdf',
        content: 'guide.pdf',
        language: 'en',
        meta: { title: 'guide.pdf' },
      },
    ]);
  });
});
