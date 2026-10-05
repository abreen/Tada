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
import { createFsModuleMock } from '../test-helpers';
import { DEFAULT_FONT_PRELOAD_FILES } from '../generate-fonts';
import type { SiteVariables } from '../types';
import { initHighlighter } from './shiki-highlighter';

const files = new Map<string, string>();
let renderedPageVariables: Record<string, unknown> = {};
let authorsConfig: Record<string, Record<string, unknown>> | undefined;
let mockedCodeHtml = '<div class="code-body">rendered code</div>';
const originalCode = { ...(await import('./code')) };
const originalTemplates = { ...(await import('../templates')) };
let renderedCodeLanguage: string | undefined;

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
  config(name: string) {
    return name === 'authors' ? authorsConfig : undefined;
  },
  getConfigFileName() {
    return undefined;
  },
  getProjectConfigDir() {
    return '/virtual/project';
  },
  render(_fileName: string, params?: Record<string, unknown>) {
    renderedPageVariables = params?.page as Record<string, unknown>;
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
  renderCodeWithComments(_source: string, lang: string) {
    renderedCodeLanguage = lang;
    return mockedCodeHtml;
  },
  rewriteProseLinks(lines: string[]) {
    return lines;
  },
}));

afterAll(() => {
  mock.module('./code', () => originalCode);
});

let preparePageTemplateHtml: typeof import('./render').preparePageTemplateHtml;
let renderCodePageAsset: typeof import('./render').renderCodePageAsset;
let renderPlainTextPageAsset: typeof import('./render').renderPlainTextPageAsset;
let renderLiterateJavaPageAsset: typeof import('./render').renderLiterateJavaPageAsset;

beforeAll(async () => {
  await initHighlighter(['text']);
  ({
    preparePageTemplateHtml,
    renderCodePageAsset,
    renderPlainTextPageAsset,
    renderLiterateJavaPageAsset,
  } = await import('./render'));
});

beforeEach(() => {
  files.clear();
  authorsConfig = undefined;
  mockedCodeHtml = '<div class="code-body">rendered code</div>';
  renderedCodeLanguage = undefined;
});

const siteVariables = {
  base: 'http://localhost',
  basePath: '/course/',
  title: 'Course',
  titlePostfix: ' - Course',
  themeColor: 'black',
  defaultTimeZone: 'America/New_York',
  defaultFont: 'sans',
  defaultContrast: 'standard',
  features: { search: true, favicon: true, footer: true, pickers: true },
  extensionToShikiLanguage: { ts: 'ts' },
} as SiteVariables;

function renderMarkdownPage({
  contentDir,
  relativePath = 'page.md',
  source,
  dependencyCollector,
  validInternalTargets = new Set<string>(),
}: {
  contentDir: string;
  relativePath?: string;
  source: string;
  validInternalTargets?: ReadonlySet<string>;
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
    siteVariables,
    validInternalTargets,
    assetFiles: [],
    literateJavaOutputPaths: new Set(),
    dependencyCollector,
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
  test('uses the configured language for mixed-case extension keys and filenames', () => {
    const contentDir = '/virtual/content';
    const filePath = path.join(contentDir, 'Sample.tS');
    writeFile(filePath, 'const value: number = 3;');

    const [pageAsset] = renderCodePageAsset({
      filePath,
      contentDir,
      isWatchMode: false,
      siteVariables: {
        ...siteVariables,
        extensionToShikiLanguage: { TS: 'typescript' },
      },
      assetFiles: [],
      validInternalTargets: new Set(),
      literateJavaOutputPaths: new Set(),
    });

    expect(renderedCodeLanguage).toBe('typescript');
    expect(pageAsset.assetPath).toBe('Sample.tS.html');
    expect(renderedPageVariables.downloadName).toBe('Sample.tS');
    expect(renderedPageVariables.codeFilePath).toBe('/Sample.tS');
  });

  test('does not inject the KaTeX stylesheet into code pages', () => {
    const contentDir = '/virtual/content';
    const filePath = path.join(contentDir, 'labs', 'example.ts');
    writeFile(filePath, 'console.log("hello");');

    const [pageAsset] = renderCodePageAsset({
      filePath,
      contentDir,
      isWatchMode: false,
      siteVariables,
      assetFiles: ['app.js', 'styles.css'],
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
      contentDir,
      isWatchMode: false,
      siteVariables,
      assetFiles: ['app.js', 'styles.css'],
      validInternalTargets: new Set(),
      literateJavaOutputPaths: new Set(),
    });

    const html = pageAsset.content.toString();

    expect(html).toContain('href="/course/katex/katex.min.css"');
  });
});

describe('renderPlainTextPageAsset', () => {
  test.each(['constructor', 'toString', '__proto__'])(
    'rejects an unconfigured author named %s',
    author => {
      authorsConfig = {};

      expect(() =>
        renderMarkdownPage({
          contentDir: '/virtual/content',
          source: `---\ntitle: Test\nauthor: ${author}\n---\nContent.\n`,
        }),
      ).toThrow(`unknown author "${author}"`);
    },
  );

  test.each(['constructor', 'toString', '__proto__'])(
    'resolves an explicitly configured author named %s',
    author => {
      const entry = { name: 'Configured author', avatar: '/avatar.svg' };
      authorsConfig = Object.fromEntries([[author, entry]]);

      renderMarkdownPage({
        contentDir: '/virtual/content',
        source: `---\ntitle: Test\nauthor: ${author}\n---\nContent.\n`,
      });

      expect(renderedPageVariables.author).toBe(entry);
    },
  );

  test.each(['md', 'html'])(
    'resolves relative links from a %s page in a literal percent-escape directory',
    extension => {
      const contentDir = path.resolve('/virtual/content');
      const filePath = path.join(contentDir, '100%20done', `page.${extension}`);
      writeFile(
        filePath,
        '---\ntitle: Percent directory\n---\n\n' +
          '<main class="body"><a href="other.html">Other</a></main>',
      );
      const target = '/100%20done/other.html';
      const dependencyCollector = { internalTargets: new Set<string>() };
      const [asset] = renderPlainTextPageAsset({
        filePath,
        contentDir,
        siteVariables,
        isWatchMode: false,
        assetFiles: [],
        validInternalTargets: new Set([target]),
        generatedPageTargets: new Set([target]),
        dependencyCollector,
      });
      expect(asset.assetPath).toBe('100%20done/page.html');
      expect(asset.content).toContain('href="other.html" data-tada-page');
      expect(dependencyCollector.internalTargets).toEqual(new Set([target]));
    },
  );

  test('resolves relative breadcrumbs from a literal encoded-slash directory', () => {
    const dependencyCollector = { internalTargets: new Set<string>() };
    renderMarkdownPage({
      contentDir: path.resolve('/virtual/content'),
      relativePath: path.join('literal%2Fslash', 'page.md'),
      source:
        '---\ntitle: Page\nbreadcrumbs:\n  - label: Other\n    url: other.html\n---\n\nContent.',
      validInternalTargets: new Set(['/literal%2Fslash/other.html']),
      dependencyCollector,
    });
    expect(dependencyCollector.internalTargets).toEqual(
      new Set(['/literal%2Fslash/other.html']),
    );
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

  test('processes Lodash expressions in Markdown partials', () => {
    const contentDir = '/virtual/content';
    writeFile(
      path.join(contentDir, '_partial.md'),
      'Page: <%= page.title %>, site: <%= site.title %>',
    );

    const html = renderMarkdownPage({
      contentDir,
      source: '---\ntitle: Partial Context\n---\n\n{{{ _partial.md }}}\n',
    });

    expect(html).toContain('Page: Partial Context, site: Course');
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

  test('does not expose the old Lodash include helper', () => {
    const contentDir = '/virtual/content';
    writeFile(path.join(contentDir, '_partial.md'), 'Should not render');

    expect(() =>
      renderMarkdownPage({
        contentDir,
        source:
          "---\ntitle: Removed Include\n---\n\n<%= include('_partial.md') %>\n",
      }),
    ).toThrow('include is not defined');
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
      'breadcrumbs: [{label: "<%= \'\' %>", url: /index.html}]',
      'breadcrumb entry 1',
    ],
    ['breadcrumbs: [{label: Docs, url: "<%= \'\' %>"}]', 'breadcrumb entry 1'],
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

test('processes nested breadcrumb labels and URLs with the front matter context before validation', () => {
  const dependencyCollector = { internalTargets: new Set<string>() };
  renderMarkdownPage({
    contentDir: '/virtual/content',
    source: `---
title: Counting **vowels** & <em>letters</em>
breadcrumbs:
  - label: "<%= site.title %> & <Notes>"
    url: "<%= '/docs/index.html' %>?view=full#overview"
  - label: "<%= _.capitalize('home') %>"
    url: "<%= '/index.html' %>"
---

Content.`,
    validInternalTargets: new Set(['/docs/index.html', '/index.html']),
    dependencyCollector,
  });
  expect(renderedPageVariables.breadcrumbs).toEqual([
    { label: 'Course & <Notes>', url: '/docs/index.html?view=full#overview' },
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
    literateJavaOutputPaths: new Set(),
    dependencyCollector,
  });
  expect([...dependencyCollector.internalTargets]).toEqual([
    '/labs/index.html',
    '/labs/00/index.html',
  ]);
});

test('resolves literate Java breadcrumbs from a literal percent-escape directory', () => {
  const contentDir = path.resolve('/virtual/content');
  const filePath = path.join(contentDir, '100%20done', 'Pair.java.md');
  writeFile(
    filePath,
    '---\ntitle: Pair\nbreadcrumbs:\n  - label: Other\n    url: other.html\n---\n\n' +
      '```java\npublic class Pair {}\n```\n',
  );
  const [asset] = renderLiterateJavaPageAsset({
    filePath,
    contentDir,
    isWatchMode: false,
    skipExecution: true,
    siteVariables,
    validInternalTargets: new Set(['/100%20done/other.html']),
    assetFiles: [],
  });
  expect(asset.assetPath).toBe('100%20done/Pair.java.html');
});
