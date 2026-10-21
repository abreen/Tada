import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  mock,
  test,
} from 'bun:test';
import path from 'path';
import { createEmptyAuthorScripts } from '../author-scripts';
import { createFsModuleMock } from '../test-helpers';
import { DEFAULT_FONT_PRELOAD_FILES } from '../generate-fonts';
import type { PageTitleIndex } from '../source-model';
import type { SiteVariables } from '../types';
import { initHighlighter } from './shiki-highlighter';

const files = new Map<string, string>();
let renderedPageVariables: Record<string, unknown> = {};
let renderedParams: Record<string, unknown> = {};
let mockedCodeHtml = '<div class="code-body">rendered code</div>';
const originalCode = { ...(await import('./code')) };
const originalTemplates = { ...(await import('../templates')) };
const originalTrace = { ...(await import('./trace')) };
const originalGlobals = { ...(await import('../globals')) };
let stdout = '';
const traceCalls: { filePath: string; args: unknown[] }[] = [];

function resolvePath(filePath: string): string {
  return path.resolve(filePath);
}

function writeFile(filePath: string, content: string): void {
  files.set(resolvePath(filePath), content);
}

const fsMock = {
  existsSync(filePath: string) {
    return files.has(resolvePath(filePath));
  },
  readFileSync(filePath: string) {
    const resolved = resolvePath(filePath);
    const content = files.get(resolved);
    if (content === undefined) {
      throw new Error(`ENOENT: no such file or directory, open '${resolved}'`);
    }
    return content;
  },
};

mock.module('fs', () => createFsModuleMock(fsMock));

mock.module('../templates', () => ({
  compileTemplates() {},
  config() {
    return undefined;
  },
  getConfigFileName() {
    return undefined;
  },
  getProjectConfigDir() {
    return '/virtual/project';
  },
  render(_fileName: string, params?: Record<string, unknown>) {
    renderedPageVariables = params?.page as Record<string, unknown>;
    renderedParams = params ?? {};
    const content = typeof params?.content === 'string' ? params.content : '';
    return `<html><head><meta charset="UTF-8"></head><body>${content}</body></html>`;
  },
}));

afterAll(() => {
  mock.module('../templates', () => originalTemplates);
});

mock.module('./code', () => ({
  extractJavaMethodToc() {
    return [];
  },
  renderCodeSegment() {
    return '<pre></pre>';
  },
  renderCodeWithComments() {
    return mockedCodeHtml;
  },
  rewriteProseLinks(lines: string[]) {
    return lines;
  },
}));

afterAll(() => {
  mock.module('./code', () => originalCode);
});

mock.module('../globals', () => ({
  globals: {
    ...originalGlobals.globals,
    cwd() {
      return path.resolve('/virtual');
    },
    stdoutWrite(chunk: string) {
      stdout += chunk;
    },
  },
}));

afterAll(() => {
  mock.module('../globals', () => originalGlobals);
});

function warnings(): string[] {
  return stdout.split('\n').filter(line => line.includes(' warn '));
}

mock.module('./trace', () => ({
  createTraceHelpers({ filePath }: { filePath: string }) {
    return {
      renderTrace(sourceFile: string, companionFiles?: string[]) {
        traceCalls.push({ filePath, args: [sourceFile, companionFiles] });
        return `<div class="trace-stub">${sourceFile}</div>`;
      },
    };
  },
}));

afterAll(() => {
  mock.module('./trace', () => originalTrace);
});

let preparePageTemplateHtml: typeof import('./render').preparePageTemplateHtml;
let renderCodePageAsset: typeof import('./render').renderCodePageAsset;
let renderPlainTextPageAsset: typeof import('./render').renderPlainTextPageAsset;
let renderLiterateJavaPageAsset: typeof import('./render').renderLiterateJavaPageAsset;
let renderCopiedContentAsset: typeof import('./render').renderCopiedContentAsset;
let readPageTitle: typeof import('./render').readPageTitle;
let readSourceFile: typeof import('../variables').readSourceFile;

beforeAll(async () => {
  await initHighlighter(['text']);
  ({
    preparePageTemplateHtml,
    renderCodePageAsset,
    renderPlainTextPageAsset,
    renderLiterateJavaPageAsset,
    renderCopiedContentAsset,
    readPageTitle,
  } = await import('./render'));
  ({ readSourceFile } = await import('../variables'));
});

beforeEach(() => {
  files.clear();
  traceCalls.length = 0;
  stdout = '';
  mockedCodeHtml = '<div class="code-body">rendered code</div>';
});

const siteVariables = {
  base: 'http://localhost',
  basePath: '/course/',
  title: 'Course',
  titlePostfix: ' - Course',
  themeColor: 'black',
  defaultFont: 'sans',
  defaultContrast: 'standard',
  features: { search: true, favicon: true, footer: true, pickers: true },
  extensionToShikiLanguage: { ts: 'ts' },
  vars: {
    courseName: 'Intro to CS',
    course: { code: 'CS 112', slug: 'cs112' },
  },
} as SiteVariables;

function renderMarkdownPage({
  contentDir,
  relativePath = 'page.md',
  source,
  dependencyCollector,
  validInternalTargets = new Set<string>(),
  withTraces = false,
  siteVariables: pageSiteVariables = siteVariables,
  pageTitles,
}: {
  siteVariables?: SiteVariables;
  pageTitles?: PageTitleIndex;
  contentDir: string;
  relativePath?: string;
  source: string;
  validInternalTargets?: ReadonlySet<string>;
  withTraces?: boolean;
  dependencyCollector?: {
    partials?: Set<string>;
    internalTargets?: Set<string>;
  };
}): string {
  const filePath = path.join(contentDir, relativePath);
  writeFile(filePath, source);

  const [pageAsset] = renderPlainTextPageAsset({
    filePath,
    contentDir,
    isWatchMode: false,
    siteVariables: pageSiteVariables,
    validInternalTargets,
    assetFiles: [],
    authorScripts: createEmptyAuthorScripts(),
    literateJavaOutputPaths: new Set(),
    dependencyCollector,
    traceCache: withTraces ? new Map() : undefined,
    pageTitles,
  });

  return pageAsset.content.toString();
}

describe('preparePageTemplateHtml', () => {
  test('injects asset tags before conditionally adding the KaTeX stylesheet', () => {
    const templateHtml =
      '<html><head><meta charset="UTF-8"></head><body><span class="katex">x</span></body></html>';

    const result = preparePageTemplateHtml({
      templateHtml,
      assetFiles: ['app.js', 'styles.css'],
      siteVariables,
    });

    expect(result).toContain('<link href="/styles.css" rel="stylesheet">');
    expect(result).toContain('<script defer src="/app.js"></script>');
    expect(result).toContain('href="/katex/katex.min.css"');
  });

  test('hints author scripts in the head so they download early', () => {
    const result = preparePageTemplateHtml({
      templateHtml: '<html><head><meta charset="UTF-8"></head></html>',
      assetFiles: [],
      siteVariables,
      authorAssets: { js: ['_scripts/site.js', '_scripts/a.js'], css: [] },
    });
    const head = result.slice(0, result.indexOf('</head>'));
    const positions = [
      '<link rel="modulepreload" href="/_scripts/site.js">',
      '<link rel="modulepreload" href="/_scripts/a.js">',
    ].map(tag => head.indexOf(tag));
    expect(positions).not.toContain(-1);
    expect(positions).toEqual(positions.toSorted((a, b) => a - b));
  });

  test('injects author stylesheets after Tada stylesheets', () => {
    const result = preparePageTemplateHtml({
      templateHtml: '<html><head><meta charset="UTF-8"></head></html>',
      assetFiles: ['index.bundle.css'],
      siteVariables,
      authorAssets: { js: [], css: ['_scripts/site.css', '_scripts/a.css'] },
    });
    const positions = [
      '<link href="/index.bundle.css" rel="stylesheet">',
      '<link href="/_scripts/site.css" rel="stylesheet" data-tada-style>',
      '<link href="/_scripts/a.css" rel="stylesheet" data-tada-style>',
    ].map(tag => result.indexOf(tag));
    expect(positions).not.toContain(-1);
    expect(positions).toEqual(positions.toSorted((a, b) => a - b));
  });

  test('injects head tags after the charset meta tag without inlining CSS', () => {
    writeFile(
      path.join('/virtual/dist', 'index.bundle.css'),
      ':root{--theme-color:red}',
    );

    const result = preparePageTemplateHtml({
      templateHtml:
        '<html><head><meta charset="UTF-8" /><title>Page</title></head>' +
        '<body><span class="katex">x</span></body></html>',
      assetFiles: ['index.bundle.js', 'index.bundle.css'],
      siteVariables,
    });

    const head = result.slice(0, result.indexOf('</head>'));
    expect(head).toStartWith('<html><head><meta charset="UTF-8" />');
    const positions = [
      '<meta charset="UTF-8" />',
      '<link href="/katex/katex.min.css" rel="stylesheet">',
      'rel="preload" href="/inter/InterVariable.woff2"',
      '<link href="/index.bundle.css" rel="stylesheet">',
      '<title>Page</title>',
      '<script defer src="/index.bundle.js"></script>',
    ].map(tag => head.indexOf(tag));
    expect(positions).not.toContain(-1);
    expect(positions).toEqual(positions.toSorted((a, b) => a - b));
    expect(result).not.toContain('<style>');
    expect(result).not.toContain('--theme-color');
  });

  test('adds only bundled font preloads without assets or KaTeX markup', () => {
    // No font files exist in the mocked filesystem: preloads never depend on
    // what the output directory contains
    const templateHtml =
      '<html><head><meta charset="UTF-8"></head><body><p>Hello</p></body></html>';

    const result = preparePageTemplateHtml({
      templateHtml,
      assetFiles: [],
      siteVariables,
    });

    const preloadTags = DEFAULT_FONT_PRELOAD_FILES.sans
      .map(
        fontPath =>
          `<link rel="preload" href="/${fontPath}" as="font" type="font/woff2" crossorigin>`,
      )
      .join('');
    expect(result).toBe(
      templateHtml.replace(
        '<meta charset="UTF-8">',
        `<meta charset="UTF-8">${preloadTags}`,
      ),
    );
  });

  test.each([
    {
      defaultFont: 'sans' as const,
      expected: [
        'inter/InterVariable.woff2',
        'google-sans-code/GoogleSansCodeVariable.woff2',
      ],
      unexpected: [
        'source-serif-4/SourceSerif4-VariableFont_opsz,wght.woff2',
        'courier-prime/CourierPrime-Regular.woff2',
      ],
    },
    {
      defaultFont: 'serif' as const,
      expected: [
        'source-serif-4/SourceSerif4-VariableFont_opsz,wght.woff2',
        'courier-prime/CourierPrime-Regular.woff2',
      ],
      unexpected: [
        'inter/InterVariable.woff2',
        'google-sans-code/GoogleSansCodeVariable.woff2',
      ],
    },
  ])(
    'preloads only the $defaultFont default font pair',
    ({ defaultFont, expected, unexpected }) => {
      const result = preparePageTemplateHtml({
        templateHtml:
          '<html><head><meta charset="UTF-8"></head><body></body></html>',
        assetFiles: [],
        siteVariables: { ...siteVariables, defaultFont },
      });

      for (const fontPath of expected) {
        expect(result).toContain(`rel="preload" href="/${fontPath}"`);
      }
      for (const fontPath of unexpected) {
        expect(result).not.toContain(fontPath);
      }
    },
  );

  test('preloads custom regular serif faces without preloading styled faces', () => {
    const result = preparePageTemplateHtml({
      templateHtml:
        '<html><head><meta charset="UTF-8"></head><body></body></html>',
      assetFiles: [],
      siteVariables: {
        ...siteVariables,
        defaultFont: 'serif',
        fontOverrides: {
          serif: {
            regular: 'fonts/Body Regular.woff2',
            italic: 'fonts/body-italic.woff2',
            bold: 'fonts/body-bold.woff2',
            boldItalic: 'fonts/body-bold-italic.woff2',
          },
        },
      },
    });

    expect(result).toContain(
      'rel="preload" href="/fonts/Body%20Regular.woff2"',
    );
    expect(result).toContain(
      'rel="preload" href="/courier-prime/CourierPrime-Regular.woff2"',
    );
    expect(result).not.toContain('body-italic.woff2');
    expect(result).not.toContain('body-bold.woff2');
    expect(result).not.toContain(
      'source-serif-4/SourceSerif4-VariableFont_opsz,wght.woff2',
    );
  });

  test('does not preload custom serif faces for a sans default', () => {
    const result = preparePageTemplateHtml({
      templateHtml:
        '<html><head><meta charset="UTF-8"></head><body></body></html>',
      assetFiles: [],
      siteVariables: {
        ...siteVariables,
        defaultFont: 'sans',
        fontOverrides: {
          serif: { regular: 'fonts/body.woff2' },
          serifMono: { regular: 'fonts/mono.woff2' },
        },
      },
    });

    expect(result).toContain('href="/inter/InterVariable.woff2"');
    expect(result).toContain(
      'href="/google-sans-code/GoogleSansCodeVariable.woff2"',
    );
    expect(result).not.toContain('fonts/body.woff2');
    expect(result).not.toContain('fonts/mono.woff2');
  });
});

describe('renderCodePageAsset', () => {
  test('does not inject the KaTeX stylesheet into code pages', () => {
    const contentDir = '/virtual/content';
    const filePath = path.join(contentDir, 'labs', 'example.ts');
    writeFile(filePath, 'console.log("hello");');

    const [pageAsset] = renderCodePageAsset({
      filePath,
      source: 'console.log("hello");',
      contentDir,
      isWatchMode: false,
      siteVariables,
      assetFiles: ['app.js', 'styles.css'],
      authorScripts: createEmptyAuthorScripts(),
      validInternalTargets: new Set(),
      literateJavaOutputPaths: new Set(),
    });

    const html = pageAsset.content.toString();

    expect(html).toContain('<link href="/course/styles.css" rel="stylesheet">');
    expect(html).toContain('<script defer src="/course/app.js"></script>');
    expect(html).not.toContain('href="/katex/katex.min.css"');
  });

  test('injects the KaTeX stylesheet into code pages with math', () => {
    mockedCodeHtml =
      '<div class="code-prose"><span class="katex">x</span></div>';
    const contentDir = '/virtual/content';
    const filePath = path.join(contentDir, 'labs', 'example.java');
    writeFile(filePath, '/// $x$\npublic class Example {}\n');

    const [pageAsset] = renderCodePageAsset({
      filePath,
      source: '/// $x$\npublic class Example {}\n',
      contentDir,
      isWatchMode: false,
      siteVariables,
      assetFiles: ['app.js', 'styles.css'],
      authorScripts: createEmptyAuthorScripts(),
      validInternalTargets: new Set(),
      literateJavaOutputPaths: new Set(),
    });

    const html = pageAsset.content.toString();

    expect(html).toContain('href="/course/katex/katex.min.css"');
  });
});

describe('renderPlainTextPageAsset', () => {
  const authorScripts = {
    requested: [],
    outputs: new Map(),
    entries: new Map([
      ['site.ts', { js: '_scripts/site.js', css: [] }],
      ['page.ts', { js: '_scripts/page.js', css: ['_scripts/page.css'] }],
    ]),
  };

  function renderWithScripts(source: string) {
    const contentDir = path.resolve('/virtual/content');
    const filePath = path.join(contentDir, 'scripts.md');
    writeFile(filePath, source);
    const [asset] = renderPlainTextPageAsset({
      filePath,
      contentDir,
      siteVariables: { ...siteVariables, scripts: ['site.ts'] },
      isWatchMode: false,
      validInternalTargets: new Set(),
      assetFiles: [],
      authorScripts,
    });
    return asset.content.toString();
  }

  test('loads site-wide scripts, then front matter scripts', () => {
    const html = renderWithScripts(
      '---\ntitle: Scripts\nscripts: [page.ts]\n---\n\nBody\n',
    );
    expect(renderedParams.authorScriptPaths).toEqual([
      '/_scripts/site.js',
      '/_scripts/page.js',
    ]);
    expect(html).toContain(
      '<link href="/course/_scripts/page.css" rel="stylesheet" data-tada-style>',
    );
  });

  test('numbers tab groups in the banner apart from those in the page', () => {
    const contentDir = path.resolve('/virtual/content');
    const filePath = path.join(contentDir, 'tabs.md');
    writeFile(filePath, '---\ntitle: Tabs\n---\n\n[A|\n\nPage\n\n]\n');
    renderPlainTextPageAsset({
      filePath,
      contentDir,
      siteVariables: { ...siteVariables, banner: '[B|\n\nBanner\n\n]\n' },
      isWatchMode: false,
      validInternalTargets: new Set(),
      assetFiles: [],
      authorScripts,
    });
    const ids = (html: unknown) =>
      Array.from(String(html).matchAll(/ id="([^"]+)"/g), match => match[1]);
    const bannerIds = ids(renderedParams.bannerHtml);
    expect(bannerIds).not.toHaveLength(0);
    expect(ids(renderedParams.content)).not.toContain(bannerIds[0]);
    expect(
      ids(renderedParams.content).filter(id => bannerIds.includes(id)),
    ).toEqual([]);
  });

  test('fails for a script that is not in src/', () => {
    expect(() =>
      renderWithScripts(
        '---\ntitle: Scripts\nscripts: [missing.ts]\n---\n\nBody\n',
      ),
    ).toThrow('scripts.md: script "missing.ts" not found in src/');
  });

  test.each(['.MD', '.mD', '.MARKDOWN', '.MarkDown'])(
    'parses front matter and Markdown for a %s page while preserving its output basename',
    extension => {
      const contentDir = path.resolve('/virtual/content');
      const filePath = path.join(contentDir, `MixedCase${extension}`);
      writeFile(
        filePath,
        '---\ntitle: Mixed case\n---\n\n**Rendered Markdown**\n',
      );
      const [asset] = renderPlainTextPageAsset({
        filePath,
        contentDir,
        siteVariables,
        isWatchMode: false,
        validInternalTargets: new Set(),
        assetFiles: [],
        authorScripts: createEmptyAuthorScripts(),
      });
      expect(renderedPageVariables.title).toBe('Mixed case');
      expect(asset.content).toContain('<strong>Rendered Markdown</strong>');
      expect(asset.content).not.toContain('title: Mixed case');
      expect(asset.assetPath).toBe('MixedCase.html');
    },
  );

  test.each(['.HTML', '.HtMl'])(
    'parses front matter but preserves literal HTML content for a %s page',
    extension => {
      const html = renderMarkdownPage({
        contentDir: path.resolve('/virtual/content'),
        relativePath: `MixedCase${extension}`,
        source: '---\ntitle: HTML case\n---\n\n<p>**literal**</p>\n',
      });
      expect(renderedPageVariables.title).toBe('HTML case');
      expect(html).toContain('<p>**literal**</p>');
      expect(html).not.toContain('title: HTML case');
    },
  );

  test('supports slides on an uppercase Markdown page', () => {
    const html = renderMarkdownPage({
      contentDir: path.resolve('/virtual/content'),
      relativePath: 'Slides.MD',
      source:
        '---\ntitle: Slides\nslides: true\n---\n\n# First\n\n---\n\n# Second\n',
    });
    expect(renderedPageVariables.slides).toBe(true);
    expect(html).toContain('data-slides-root');
    expect(html).toContain('id="first"');
    expect(html).toContain('id="second"');
  });

  test('includes a basic Markdown partial block', () => {
    const contentDir = '/virtual/content';
    const partialPath = path.join(contentDir, '_partial.md');
    writeFile(partialPath, '**Hello** from partial');
    const dependencyCollector = { partials: new Set<string>() };

    const html = renderMarkdownPage({
      contentDir,
      source: '---\ntitle: Partial Test\n---\n\n{{{ _partial.md }}}\n',
      dependencyCollector,
    });

    expect(html).toContain('<strong>Hello</strong> from partial');
    expect([...dependencyCollector.partials]).toEqual([
      path.resolve(partialPath),
    ]);
  });

  test('substitutes site variables in Markdown partials', () => {
    const contentDir = '/virtual/content';
    writeFile(
      path.join(contentDir, '_partial.md'),
      'Course: {{ courseName }} ({{ course.code }})',
    );

    const html = renderMarkdownPage({
      contentDir,
      source: '---\ntitle: Partial Context\n---\n\n{{{ _partial.md }}}\n',
    });

    expect(html).toContain('Course: Intro to CS (CS 112)');
  });

  test('reports unknown variables with the partial path', () => {
    const contentDir = '/virtual/content';
    writeFile(path.join(contentDir, '_partial.md'), '{{ page.title }}');

    expect(() =>
      renderMarkdownPage({
        contentDir,
        source: '---\ntitle: Partial Context\n---\n\n{{{ _partial.md }}}\n',
      }),
    ).toThrow('content/_partial.md: unknown variable "{{ page.title }}"');
  });

  test('reports a broken wikilink in a partial with the partial path', () => {
    const contentDir = '/virtual/content';
    writeFile(path.join(contentDir, '_inner.md'), 'See [[Missing]].');
    writeFile(
      path.join(contentDir, '_outer.md'),
      'Outer.\n\n{{{ _inner.md }}}',
    );
    const pageTitles = { byTitle: new Map(), unlinkableTitles: [] };

    expect(() =>
      renderMarkdownPage({
        contentDir,
        source: '---\ntitle: Page\n---\n\n{{{ _outer.md }}}\n',
        pageTitles,
      }),
    ).toThrow('content/_inner.md: broken wikilink "[[Missing]]"');
    expect(() =>
      renderMarkdownPage({
        contentDir,
        source: '---\ntitle: Page\n---\n\nSee [[Missing]].\n',
        pageTitles,
      }),
    ).toThrow('content/page.md: broken wikilink "[[Missing]]"');
  });

  test('reports a broken wikilink in a partial footnote with the partial path', () => {
    const contentDir = '/virtual/content';
    writeFile(path.join(contentDir, '_note.md'), 'Text^[See [[Missing]].]');
    expect(() =>
      renderMarkdownPage({
        contentDir,
        source: '---\ntitle: Page\n---\n\n{{{ _note.md }}}\n',
        pageTitles: { byTitle: new Map(), unlinkableTitles: [] },
      }),
    ).toThrow('content/_note.md: broken wikilink "[[Missing]]"');
  });

  test('supports nested partials relative to the partial file', () => {
    const contentDir = '/virtual/content';
    const outerPath = path.join(contentDir, 'subdir', '_outer.md');
    const innerPath = path.join(contentDir, 'subdir', '_inner.md');
    writeFile(outerPath, 'Outer then\n\n{{{ _inner.md }}}');
    writeFile(innerPath, 'Inner in subdir');
    const dependencyCollector = { partials: new Set<string>() };

    const html = renderMarkdownPage({
      contentDir,
      source: '---\ntitle: Nested\n---\n\n{{{ subdir/_outer.md }}}\n',
      dependencyCollector,
    });

    expect(html).toContain('Outer then');
    expect(html).toContain('Inner in subdir');
    expect([...dependencyCollector.partials]).toEqual([
      path.resolve(outerPath),
      path.resolve(innerPath),
    ]);
  });

  test('strips HTML comments from Markdown partials', () => {
    const contentDir = '/virtual/content';
    writeFile(
      path.join(contentDir, '_partial.md'),
      'before<!--- hidden --->after',
    );

    const html = renderMarkdownPage({
      contentDir,
      source: '---\ntitle: Comments\n---\n\n{{{ _partial.md }}}\n',
    });

    expect(html).toContain('beforeafter');
    expect(html).not.toContain('hidden');
  });

  test('removes commented-out partial blocks before resolving includes', () => {
    const contentDir = '/virtual/content';

    const html = renderMarkdownPage({
      contentDir,
      source: [
        '---',
        'title: Commented Include',
        '---',
        '',
        'Before',
        '',
        '<!--- {{{ _missing.md }}} --->',
        '',
        'After',
        '',
      ].join('\n'),
    });

    expect(html).toContain('<p>Before</p>');
    expect(html).toContain('<p>After</p>');
    expect(html).not.toContain('_missing.md');
  });

  test('renders partial blocks inside list items and blockquotes', () => {
    const contentDir = '/virtual/content';
    writeFile(path.join(contentDir, '_item.md'), 'included **item**');
    writeFile(path.join(contentDir, '_quote.md'), 'Quoted partial');

    const html = renderMarkdownPage({
      contentDir,
      source: [
        '---',
        'title: Context',
        '---',
        '',
        '- {{{ _item.md }}}',
        '',
        '> {{{ _quote.md }}}',
        '',
      ].join('\n'),
    });

    expect(html).toContain('<ul class="styled-list">');
    expect(html).toContain('included <strong>item</strong>');
    expect(html).toContain('<blockquote>');
    expect(html).toContain('Quoted partial');
  });

  test('renders an indented partial list as a nested sub-list', () => {
    const contentDir = '/virtual/content';
    writeFile(
      path.join(contentDir, '_groceries.md'),
      '* apples\n* oranges\n* pears\n',
    );

    const html = renderMarkdownPage({
      contentDir,
      source: [
        '---',
        'title: To do list',
        '---',
        '',
        '* Grocery shopping',
        '  {{{ _groceries.md }}}',
        '* Car wash',
        '',
      ].join('\n'),
    });

    expect(html).toContain(
      '<li><div class="styled-list-item">Grocery shopping\n<ul class="styled-list">',
    );
    expect(html).toContain(
      '<li><div class="styled-list-item">apples</div></li>',
    );
    expect(html).toContain(
      '<li><div class="styled-list-item">oranges</div></li>',
    );
    expect(html).toContain(
      '<li><div class="styled-list-item">pears</div></li>',
    );
    expect(html).toContain(
      '</ul>\n</div></li>\n<li><div class="styled-list-item">Car wash</div></li>',
    );
  });

  test('renders partial blocks inside alert containers', () => {
    const contentDir = '/virtual/content';
    writeFile(path.join(contentDir, '_partial.md'), 'Included **note** body');

    const html = renderMarkdownPage({
      contentDir,
      source: [
        '---',
        'title: Alert Partial',
        '---',
        '',
        '!!! note',
        '{{{ _partial.md }}}',
        '!!!',
        '',
      ].join('\n'),
    });

    expect(html).toContain('<div class="alert note">');
    expect(html).toContain('<p class="title" id="note">Note</p>');
    expect(html).toContain('Included <strong>note</strong> body');
  });

  test('preserves paragraphs from loose partial blocks inside list items', () => {
    const contentDir = '/virtual/content';
    writeFile(
      path.join(contentDir, '_item.md'),
      'First paragraph\n\nSecond paragraph',
    );

    const html = renderMarkdownPage({
      contentDir,
      source: [
        '---',
        'title: Loose List Partial',
        '---',
        '',
        '- {{{ _item.md }}}',
        '',
      ].join('\n'),
    });

    expect(html).toContain('<p>First paragraph</p>');
    expect(html).toContain('<p>Second paragraph</p>');
    expect(html).not.toContain('First paragraphSecond paragraph');
  });

  test('renders separate fenced blocks from a CRLF partial inside a list item', () => {
    const contentDir = '/virtual/content';
    writeFile(
      path.join(contentDir, '_verify.md'),
      [
        '1. Run the command:',
        '   ```',
        '   java -version',
        '   ```',
        '   You should see output like this:',
        '   ```',
        '   openjdk version "25.0.1"',
        '   ```',
      ].join('\r\n'),
    );

    const html = renderMarkdownPage({
      contentDir,
      source: [
        '---',
        'title: CRLF Partial',
        '---',
        '',
        '{{{ _verify.md }}}',
        '',
      ].join('\n'),
    });

    expect(html.match(/<pre /g)).toHaveLength(2);
    expect(html).toMatch(/<\/pre>You should see output like this:<pre /);
    expect(html).not.toContain('<span>```</span>');
  });

  test('keeps escaped and code triple-curly text literal', () => {
    const contentDir = '/virtual/content';
    writeFile(path.join(contentDir, '_partial.md'), 'Should not render');

    const html = renderMarkdownPage({
      contentDir,
      source: [
        '---',
        'title: Escaped',
        '---',
        '',
        '\\{{{ _partial.md }}}',
        '',
        'Use `{{{ source }}}` inline.',
        '',
        '    {{{ code_block }}}',
        '',
      ].join('\n'),
    });

    expect(html).toContain('{{{ _partial.md }}}');
    expect(html).toContain('<code>{{{ source }}}</code>');
    expect(html).toContain('{{{ code_block }}}');
    expect(html).not.toContain('Should not render');
  });

  test('throws when a Markdown partial is missing', () => {
    const contentDir = '/virtual/content';

    expect(() =>
      renderMarkdownPage({
        contentDir,
        source: '---\ntitle: Missing\n---\n\n{{{ _missing.md }}}\n',
      }),
    ).toThrow('partial not found');
  });

  test('throws when a partial target does not start with underscore', () => {
    const contentDir = '/virtual/content';
    writeFile(path.join(contentDir, 'notpartial.md'), 'content');

    expect(() =>
      renderMarkdownPage({
        contentDir,
        source: '---\ntitle: Bad Partial\n---\n\n{{{ notpartial.md }}}\n',
      }),
    ).toThrow('must start with "_"');
  });

  test('throws when a partial target is HTML', () => {
    const contentDir = '/virtual/content';
    writeFile(path.join(contentDir, '_partial.html'), '<p>HTML partial</p>');

    expect(() =>
      renderMarkdownPage({
        contentDir,
        source: '---\ntitle: HTML Partial\n---\n\n{{{ _partial.html }}}\n',
      }),
    ).toThrow('must be a Markdown file');
  });

  test('throws when max partial depth is exceeded', () => {
    const contentDir = '/virtual/content';
    for (let i = 0; i <= 10; i++) {
      const content = i < 10 ? `{{{ _${i + 1}.md }}}` : 'end';
      writeFile(path.join(contentDir, `_${i}.md`), content);
    }

    expect(() =>
      renderMarkdownPage({
        contentDir,
        source: '---\ntitle: Depth\n---\n\n{{{ _0.md }}}\n',
      }),
    ).toThrow('maximum include depth');
  });

  test('warns about and ignores unknown front matter keys', () => {
    renderMarkdownPage({
      contentDir: '/virtual/content',
      source:
        '---\ntitle: Keys\ntoolName: Tada\npublshed: 2026-01-01\n---\n\nBody\n',
    });

    const lines = warnings();
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain(
      'content/page.md: ignoring unknown front matter field "toolName"',
    );
    expect(lines[0]).toContain('"vars"');
    expect(lines[1]).toContain('unknown front matter field "publshed"');
  });

  test('drops unknown front matter keys before substitution', () => {
    renderMarkdownPage({
      contentDir: '/virtual/content',
      source: '---\ntitle: Keys\nnotes: "see {{ oldVar }}"\n---\n\nBody\n',
    });

    expect(warnings()).toHaveLength(1);
    expect(renderedPageVariables).not.toHaveProperty('notes');
  });

  test('substitutes variables in inline footnotes and question headings', () => {
    const html = renderMarkdownPage({
      contentDir: '/virtual/content',
      source: [
        '---',
        'title: Extensions',
        '---',
        '',
        'Text^[See {{ courseName }}]',
        '',
        '??? question Is \\{{ courseName }} `\\{{ code }}` {{ courseName }}?',
        '',
        'Yes.',
        '',
        '???',
        '',
      ].join('\n'),
    });

    expect(html).toContain('See Intro to CS');
    expect(html).toContain(
      'Is {{ courseName }} <code>{{ code }}</code> Intro to CS?',
    );
    expect(html).not.toContain('\uE000');
  });

  test('marks a superlink external from its substituted URL', () => {
    const html = renderMarkdownPage({
      siteVariables: {
        ...siteVariables,
        vars: { docsUrl: 'https://other.site/docs' },
      },
      contentDir: '/virtual/content',
      source: '---\ntitle: Links\n---\n\n[Docs][Reference]({{ docsUrl }})\n',
    });

    expect(html).toContain('href="https://other.site/docs"');
    expect(html).toContain('class="button superlink external"');
    expect(html).toContain('target="_blank"');
  });

  test('does not warn about known front matter keys', () => {
    renderMarkdownPage({
      contentDir: '/virtual/content',
      source:
        '---\ntitle: Keys\ndescription: D\npublished: 2026-01-01\ntoc: true\nbreadcrumbs: []\nskip: false\nstdin: x\n---\n\nBody\n',
    });

    expect(warnings()).toEqual([]);
  });

  test('substitutes site variables in front matter strings', () => {
    renderMarkdownPage({
      contentDir: '/virtual/content',
      source:
        '---\ntitle: "{{ course.code }} home"\ndescription: About {{ courseName }}\n---\n\nBody\n',
    });

    expect(renderedPageVariables.title).toBe('CS 112 home');
    expect(renderedPageVariables.description).toBe('About Intro to CS');
  });

  test('substitutes site variables in the page body', () => {
    const html = renderMarkdownPage({
      contentDir: '/virtual/content',
      source:
        '---\ntitle: Vars\n---\n\nWelcome to **{{ courseName }}**, [{{ course.code }}](https://example.edu/{{ course.slug }}).\n',
    });

    expect(html).toContain('Welcome to <strong>Intro to CS</strong>');
    expect(html).toContain('href="https://example.edu/cs112"');
  });

  test('substitutes site variables in HTML page bodies', () => {
    const html = renderMarkdownPage({
      contentDir: '/virtual/content',
      relativePath: 'page.html',
      source: '---\ntitle: Vars\n---\n\n<p>{{ courseName }}</p>\n',
    });

    expect(html).toContain('<p>Intro to CS</p>');
  });

  test('substitutes variables in code, where a backslash escapes them', () => {
    const html = renderMarkdownPage({
      contentDir: '/virtual/content',
      source:
        '---\ntitle: Vars\n---\n\n`{{ courseName }}` and `\\{{ name }}`\n\n```text\n<p>\\{{ message }}</p> {{ courseName }}\n```\n',
    });

    expect(html).toContain(
      '<code>Intro to CS</code> and <code>{{ name }}</code>',
    );
    expect(html).toContain('{{ message }}');
    expect(html).not.toContain('\\{{');
  });

  test('fails for an unquoted variable in front matter', () => {
    expect(() =>
      renderMarkdownPage({
        contentDir: '/virtual/content',
        source: '---\ntitle: {{ courseName }}\n---\n\nBody\n',
      }),
    ).toThrow(
      'content/page.md: a value for "title" starts with an unquoted {{ }} variable',
    );
  });

  test('fails clearly for an unquoted variable followed by more text', () => {
    expect(() =>
      renderMarkdownPage({
        contentDir: '/virtual/content',
        source:
          '---\ntitle: {{ courseName }} home\n---\n\nNote: {{ courseName }}\n',
      }),
    ).toThrow(
      'content/page.md: a value for "title" starts with an unquoted {{ }} variable',
    );
  });

  test('inserts variable values as Markdown source', () => {
    const html = renderMarkdownPage({
      siteVariables: { ...siteVariables, vars: { x: '**bold**' } },
      contentDir: '/virtual/content',
      source: '---\ntitle: "{{ x }}"\n---\n\nValue: {{ x }}\n',
    });

    expect(html).toContain('Value: <strong>bold</strong>');
    expect(renderedPageVariables.title).toBe('bold');
  });

  test('fails for an unknown variable in the page body', () => {
    expect(() =>
      renderMarkdownPage({
        contentDir: '/virtual/content',
        source: '---\ntitle: Vars\n---\n\n{{ missing }}\n',
      }),
    ).toThrow('content/page.md: unknown variable "{{ missing }}"');
  });

  test('renders Lodash template syntax in author content as literal text', () => {
    const contentDir = '/virtual/content';
    writeFile(path.join(contentDir, '_partial.md'), 'Should not render');

    const html = renderMarkdownPage({
      contentDir,
      source:
        "---\ntitle: Literal Lodash\n---\n\n<%= include('_partial.md') %> and <% if (x) { %>\n",
    });

    expect(html).not.toContain('Should not render');
    expect(html).toContain('&lt;%= include(');
  });

  test('renders a trace fence with the trace helper', () => {
    const html = renderMarkdownPage({
      contentDir: '/virtual/content',
      relativePath: 'labs/index.md',
      withTraces: true,
      source: [
        '---',
        'title: Traces',
        '---',
        '',
        '```trace',
        'Demo.java',
        '',
        '  ../lib/Helper.java  ',
        '```',
        '',
        '```trace',
        'demo.py',
        '```',
        '',
      ].join('\n'),
    });

    expect(html).toContain('<div class="trace-stub">Demo.java</div>');
    expect(html).toContain('<div class="trace-stub">demo.py</div>');
    expect(traceCalls.map(call => call.args)).toEqual([
      ['Demo.java', ['../lib/Helper.java']],
      ['demo.py', []],
    ]);
    expect(traceCalls[0].filePath).toBe(
      path.join('/virtual/content', 'labs', 'index.md'),
    );
  });

  test('renders a trace fence inside a partial relative to the page', () => {
    const contentDir = '/virtual/content';
    writeFile(
      path.join(contentDir, 'shared', '_trace.md'),
      '```trace\nDemo.java\n```\n',
    );

    const html = renderMarkdownPage({
      contentDir,
      relativePath: 'labs/index.md',
      withTraces: true,
      source: '---\ntitle: Traces\n---\n\n{{{ ../shared/_trace.md }}}\n',
    });

    expect(html).toContain('<div class="trace-stub">Demo.java</div>');
    expect(traceCalls[0].filePath).toBe(
      path.join(contentDir, 'labs', 'index.md'),
    );
  });

  test('fails for an empty trace fence', () => {
    expect(() =>
      renderMarkdownPage({
        contentDir: '/virtual/content',
        withTraces: true,
        source: '---\ntitle: Traces\n---\n\n```trace\n\n```\n',
      }),
    ).toThrow('trace block must name a source file');
  });

  test('fails for a trace fence when traces are unavailable', () => {
    expect(() =>
      renderMarkdownPage({
        contentDir: '/virtual/content',
        source: '---\ntitle: Traces\n---\n\n```trace\nDemo.java\n```\n',
      }),
    ).toThrow('trace blocks are not supported here');
  });

  test.each(['.html', '.HTML', '.HtMl'])(
    'rejects slides front matter on %s content pages',
    extension => {
      const contentDir = '/virtual/content';
      const filePath = path.join(contentDir, `slides${extension}`);
      writeFile(
        filePath,
        [
          '---',
          'title: HTML Slides',
          'slides: true',
          '---',
          '',
          '<p>Hello</p>',
        ].join('\n'),
      );

      expect(() =>
        renderPlainTextPageAsset({
          filePath,
          contentDir,
          isWatchMode: false,
          siteVariables,
          validInternalTargets: new Set(),
          assetFiles: [],
          authorScripts: createEmptyAuthorScripts(),
          literateJavaOutputPaths: new Set(),
        }),
      ).toThrow('slides mode is only supported on Markdown pages');
    },
  );

  test('tracks multiple relative breadcrumbs from the declaring page', () => {
    const contentDir = '/virtual/content';
    const filePath = path.join(contentDir, 'docs', 'topic', 'page.html');
    writeFile(
      filePath,
      [
        'title: Child page',
        'breadcrumbs:',
        '  - label: Docs',
        '    url: ../index.html?view=full#overview',
        '  - label: Home',
        '    url: /index.html',
        '',
        '<p>Hello</p>',
      ].join('\n'),
    );

    const dependencyCollector = { internalTargets: new Set<string>() };

    renderPlainTextPageAsset({
      filePath,
      contentDir,
      isWatchMode: false,
      siteVariables,
      validInternalTargets: new Set(['/docs/index.html', '/index.html']),
      assetFiles: [],
      authorScripts: createEmptyAuthorScripts(),
      literateJavaOutputPaths: new Set(),
      dependencyCollector,
    });

    expect([...dependencyCollector.internalTargets]).toEqual([
      '/docs/index.html',
      '/index.html',
    ]);
  });

  test('rejects breadcrumbs without a pathname', () => {
    const contentDir = '/virtual/content';
    const filePath = path.join(contentDir, 'docs', 'topic', 'index.html');
    writeFile(
      filePath,
      [
        'title: Topic index',
        'breadcrumbs:',
        '  - label: Topic',
        '    url: ?view=full#overview',
        '',
        '<p>Hello</p>',
      ].join('\n'),
    );

    const dependencyCollector = { internalTargets: new Set<string>() };

    expect(() =>
      renderPlainTextPageAsset({
        filePath,
        contentDir,
        isWatchMode: false,
        siteVariables,
        validInternalTargets: new Set([
          '/docs/topic',
          '/docs/topic/',
          '/docs/topic/index.html',
        ]),
        assetFiles: [],
        authorScripts: createEmptyAuthorScripts(),
        literateJavaOutputPaths: new Set(),
        dependencyCollector,
      }),
    ).toThrow('broken breadcrumb link');

    expect([...dependencyCollector.internalTargets]).toEqual([]);
  });
});

describe('breadcrumb front matter', () => {
  test.each([
    ['breadcrumbs: null', 'breadcrumbs must be a list'],
    ['breadcrumbs: Docs', 'breadcrumbs must be a list'],
    ['breadcrumbs: {}', 'breadcrumbs must be a list'],
    [
      'breadcrumbs: [{label: "{{ empty }}", url: /index.html}]',
      'breadcrumb entry 1',
    ],
    ['breadcrumbs: [{label: Docs, url: "{{ empty }}"}]', 'breadcrumb entry 1'],
    ['breadcrumbs: [null]', 'breadcrumb entry 1'],
    ['breadcrumbs: [Docs]', 'breadcrumb entry 1'],
    ['breadcrumbs: [[]]', 'breadcrumb entry 1'],
    ['breadcrumbs: [{}]', 'breadcrumb entry 1'],
    ['breadcrumbs: [{label: Docs}]', 'breadcrumb entry 1'],
    ['breadcrumbs: [{url: /index.html}]', 'breadcrumb entry 1'],
    ['breadcrumbs: [{label: "", url: /index.html}]', 'breadcrumb entry 1'],
    ['breadcrumbs: [{label: "  ", url: /index.html}]', 'breadcrumb entry 1'],
    ['breadcrumbs: [{label: 42, url: /index.html}]', 'breadcrumb entry 1'],
    ['breadcrumbs: [{label: Docs, url: false}]', 'breadcrumb entry 1'],
    ['breadcrumbs: [{label: Docs, url: ""}]', 'breadcrumb entry 1'],
    ['breadcrumbs: [{label: Docs, url: "  "}]', 'breadcrumb entry 1'],
    [
      'breadcrumbs: [{label: Docs, url: /index.html}, {}]',
      'breadcrumb entry 2',
    ],
  ])('rejects malformed %s', (frontMatter, diagnostic) => {
    expect(() =>
      renderMarkdownPage({
        siteVariables: { ...siteVariables, vars: { empty: '' } },
        contentDir: '/virtual/content',
        source: `---\ntitle: Page\n${frontMatter}\n---\n\nContent.`,
        validInternalTargets: new Set(['/index.html']),
      }),
    ).toThrow(diagnostic);
  });

  test.each(['parent', 'parentLabel'])(
    'rejects legacy %s even when empty',
    key => {
      expect(() =>
        renderMarkdownPage({
          contentDir: '/virtual/content',
          source: `---\ntitle: Page\n${key}:\n---\n\nContent.`,
        }),
      ).toThrow(`front matter key "${key}" is reserved`);
    },
  );

  test.each(['', 'breadcrumbs: []\n'])(
    'accepts absent or empty breadcrumbs: %s',
    frontMatter => {
      expect(() =>
        renderMarkdownPage({
          contentDir: '/virtual/content',
          source: `---\ntitle: Page\n${frontMatter}---\n\nContent.`,
        }),
      ).not.toThrow();
    },
  );
});

test('substitutes site variables in nested breadcrumb labels and URLs before validation', () => {
  const dependencyCollector = { internalTargets: new Set<string>() };
  renderMarkdownPage({
    siteVariables: {
      ...siteVariables,
      vars: {
        courseName: 'Intro to CS',
        docsDir: 'docs',
        homeUrl: '/index.html',
      },
    },
    contentDir: '/virtual/content',
    source: `---
title: Counting **vowels** & <em>letters</em>
breadcrumbs:
  - label: "{{ courseName }} & <Notes>"
    url: "/{{ docsDir }}/index.html?view=full#overview"
  - label: Home
    url: "{{ homeUrl }}"
---

Content.`,
    validInternalTargets: new Set(['/docs/index.html', '/index.html']),
    dependencyCollector,
  });
  expect(renderedPageVariables.breadcrumbs).toEqual([
    {
      label: 'Intro to CS & <Notes>',
      url: '/docs/index.html?view=full#overview',
    },
    { label: 'Home', url: '/index.html' },
  ]);
  expect(renderedPageVariables.title).toBe('Counting vowels & letters');
  expect([...dependencyCollector.internalTargets]).toEqual([
    '/docs/index.html',
    '/index.html',
  ]);
});

test('collects every literate Java breadcrumb dependency when execution is unavailable', () => {
  const contentDir = '/virtual/content';
  const filePath = path.join(contentDir, 'labs', '00', 'Pair.java.md');
  writeFile(
    filePath,
    `---
title: Pair
breadcrumbs:
  - label: Labs
    url: ../index.html?view=full#intro
  - label: Lab 0
    url: ./index.html
---

\`\`\`java
public class Pair {}
\`\`\`
`,
  );
  const dependencyCollector = { internalTargets: new Set<string>() };
  renderLiterateJavaPageAsset({
    filePath,
    contentDir,
    isWatchMode: true,
    skipExecution: true,
    siteVariables,
    validInternalTargets: new Set(['/labs/index.html', '/labs/00/index.html']),
    assetFiles: [],
    authorScripts: createEmptyAuthorScripts(),
    literateJavaOutputPaths: new Set(),
    dependencyCollector,
  });
  expect([...dependencyCollector.internalTargets]).toEqual([
    '/labs/index.html',
    '/labs/00/index.html',
  ]);
});

test('ignores variables inside HTML comments in literate Java pages and their partials', () => {
  const contentDir = '/virtual/content';
  const filePath = path.join(contentDir, 'labs', 'Pair.java.md');
  writeFile(
    path.join(contentDir, 'labs', '_note.md'),
    'Note <!--- {{ missingInPartial }} --->',
  );
  writeFile(
    filePath,
    `---
title: Pair
---

<!--- TODO: mention {{ missingInPage }} --->

{{{ _note.md }}}

\`\`\`java
public class Pair {}
\`\`\`
`,
  );
  expect(() =>
    renderLiterateJavaPageAsset({
      filePath,
      contentDir,
      isWatchMode: true,
      skipExecution: true,
      siteVariables,
      validInternalTargets: new Set(),
      assetFiles: [],
      authorScripts: createEmptyAuthorScripts(),
      literateJavaOutputPaths: new Set(),
    }),
  ).not.toThrow();
});

describe('variables in hidden literate Java blocks', () => {
  const contentDir = '/virtual/content';
  const filePath = path.join(contentDir, 'labs', 'Course.java.md');

  function renderLiterate(page: string) {
    writeFile(filePath, `---\ntitle: Course\n---\n\n${page}`);
    return renderLiterateJavaPageAsset({
      filePath,
      contentDir,
      isWatchMode: true,
      skipExecution: true,
      siteVariables,
      validInternalTargets: new Set(),
      assetFiles: [],
      authorScripts: createEmptyAuthorScripts(),
      literateJavaOutputPaths: new Set(),
    });
  }

  test('substitutes variables in hidden blocks on the page and in partials', () => {
    writeFile(
      path.join(contentDir, 'labs', '_hidden.md'),
      '<!---\n```java\nstatic String P = "{{ courseName }}";\n```\n--->',
    );
    const [, javaAsset] = renderLiterate(
      [
        '<!---',
        '```java',
        'public class Course {',
        '  static String C = "{{ courseName }}";',
        '```',
        '--->',
        '',
        '{{{ _hidden.md }}}',
        '',
        '```java',
        '}',
        '```',
        '',
      ].join('\n'),
    );

    expect(javaAsset.content).toContain('static String C = "Intro to CS";');
    expect(javaAsset.content).toContain('static String P = "Intro to CS";');
  });

  test('keeps comment-like text in visible Java code', () => {
    const [, javaAsset] = renderLiterate(
      '```java\nclass Course { String s = "<!--- {{ courseName }} -->"; }\n```\n',
    );

    expect(javaAsset.content).toContain(
      'String s = "<!--- {{ courseName }} -->";',
    );
  });

  test('fails for an unknown variable in a hidden block', () => {
    expect(() =>
      renderLiterate(
        '<!---\n```java\nclass Course { String s = "{{ missingHidden }}"; }\n```\n--->\n',
      ),
    ).toThrow('unknown variable "{{ missingHidden }}"');
  });
});

describe('renderCopiedContentAsset', () => {
  const contentDir = path.resolve('/virtual/content');
  const codeSiteVariables = {
    ...siteVariables,
    extensionToShikiLanguage: { java: 'java', py: 'python' },
  } as SiteVariables;

  function copy(fileName: string, source: string) {
    const filePath = path.join(contentDir, fileName);
    writeFile(filePath, source);
    const [asset] = renderCopiedContentAsset({
      filePath,
      source: readSourceFile(filePath, contentDir, codeSiteVariables),
      contentDir,
      siteVariables: codeSiteVariables,
    });
    return asset.content;
  }

  test('substitutes variables in mapped source files', () => {
    expect(
      copy(
        'A.java',
        '/// For {{ courseName }}\nclass A { String s = "{{ courseName }}"; }\n',
      ),
    ).toBe('/// For Intro to CS\nclass A { String s = "Intro to CS"; }\n');
    expect(copy('demo.py', '# {{ courseName }}\nprint(f"\\{{x}}")\n')).toBe(
      '# Intro to CS\nprint(f"{{x}}")\n',
    );
  });
});

describe('home page title', () => {
  const contentDir = '/virtual/content';

  test('may be omitted on the root index.md', () => {
    renderMarkdownPage({
      contentDir,
      relativePath: 'index.md',
      source: '---\n---\n\nWelcome\n',
    });

    expect(renderedPageVariables.title).toBeUndefined();
    expect(renderedPageVariables.titleHtml).toBeUndefined();
  });

  test('may be omitted on a root index.html content page', () => {
    renderMarkdownPage({
      contentDir,
      relativePath: 'index.html',
      source: '---\n---\n\n<p>Welcome</p>\n',
    });

    expect(renderedPageVariables.title).toBeUndefined();
  });

  test.each(['docs/index.md', 'page.md'])(
    'is still required on %s',
    relativePath => {
      expect(() =>
        renderMarkdownPage({
          contentDir,
          relativePath,
          source: '---\n---\n\nBody\n',
        }),
      ).toThrow('missing required front matter field: "title"');
    },
  );

  test('is required on the home page when it has breadcrumbs', () => {
    expect(() =>
      renderMarkdownPage({
        contentDir,
        relativePath: 'index.md',
        source:
          '---\nbreadcrumbs:\n  - label: Docs\n    url: /docs/index.html\n---\n\nBody\n',
        validInternalTargets: new Set(['/docs/index.html']),
      }),
    ).toThrow('index.md: front matter "breadcrumbs" requires a "title"');
  });
});

describe('readPageTitle', () => {
  const pagePath = path.join(path.sep, 'virtual', 'content', 'page.md');
  const titleSiteVariables = {
    ...siteVariables,
    vars: { course: 'CS 101' },
  } as SiteVariables;

  test('renders the title the scan read without reading the page', () => {
    // The page is not in the mocked file system, so reading it would throw
    expect(
      readPageTitle(
        pagePath,
        {
          renderKind: 'plain-text-page',
          titleFields: { title: '{{ course }} *notes*' },
        },
        titleSiteVariables,
      ),
    ).toEqual({ title: 'CS 101 notes', titleHtml: 'CS 101 <em>notes</em>' });
  });

  test('reads the page to report front matter the scan could not parse', () => {
    writeFile(pagePath, '---\ntitle: {{ course }} notes\n---\n\nBody\n');
    expect(() =>
      readPageTitle(
        pagePath,
        { renderKind: 'plain-text-page' },
        titleSiteVariables,
      ),
    ).toThrow('"title"');
  });

  test('reads the page to report front matter rendering rejects', () => {
    writeFile(pagePath, '---\ntitle: {{ course }}\n---\n\nBody\n');
    expect(() =>
      readPageTitle(
        pagePath,
        {
          renderKind: 'plain-text-page',
          titleFields: { title: { course: null }, invalid: true },
        },
        titleSiteVariables,
      ),
    ).toThrow('unquoted');
  });

  test('requires a title written as text', () => {
    expect(() =>
      readPageTitle(
        pagePath,
        { renderKind: 'plain-text-page', titleFields: { title: 1.1 } },
        titleSiteVariables,
      ),
    ).toThrow('"title" must be text');
  });
});
