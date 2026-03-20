const path = require('path');
const { describe, expect, test } = require('bun:test');
const { buildIndex, collectIndexTargets } = require('./pagefind');

function createFakePagefind(calls) {
  const fakeIndex = {
    addHTMLFile: async file => {
      calls.htmlFiles?.push(file);
      return { errors: [], file: { url: file.sourcePath, meta: {} } };
    },
    addCustomRecord: async record => {
      calls.customRecords?.push(record);
      return { errors: [], file: { url: record.url, meta: record.meta } };
    },
    writeFiles: async ({ outputPath }) => {
      calls.outputPath = outputPath;
      return { errors: [], outputPath };
    },
    deleteIndex: async () => {
      calls.deleted = (calls.deleted || 0) + 1;
    },
  };

  return async () => ({
    createIndex: async () => ({ index: fakeIndex, errors: [] }),
  });
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
      { basePath: '/' },
      pdfSourceByOutputPath,
    );

    expect(result).toEqual({
      reachableHtmlPaths: ['about/index.html', 'index.html'],
      reachablePdfPaths: ['/docs/guide.pdf'],
    });
  });

  test('buildIndex adds HTML files and per-page PDF custom records', async () => {
    const calls = { htmlFiles: [], customRecords: [], outputPath: null };

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

  test('buildIndex falls back to a single PDF record when text extraction is empty', async () => {
    const calls = { customRecords: [] };

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
