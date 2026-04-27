import { beforeAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import path from 'path';
import { createFsModuleMock } from '../test-helpers';
import type { SiteVariables } from '../types';

const files = new Map<string, string>();

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
    const content = typeof params?.content === 'string' ? params.content : '';
    return `<html><head><meta charset="UTF-8"></head><body>${content}</body></html>`;
  },
}));

mock.module('./code', () => ({
  extractJavaMethodToc() {
    return [];
  },
  renderCodeSegment() {
    return '<pre></pre>';
  },
  renderCodeWithComments() {
    return '<div class="code-body">rendered code</div>';
  },
  rewriteProseLinks(lines: string[]) {
    return lines;
  },
}));

let preparePageTemplateHtml: typeof import('./render').preparePageTemplateHtml;
let renderCodePageAsset: typeof import('./render').renderCodePageAsset;
let renderPlainTextPageAsset: typeof import('./render').renderPlainTextPageAsset;

beforeAll(async () => {
  ({ preparePageTemplateHtml, renderCodePageAsset, renderPlainTextPageAsset } =
    await import('./render'));
});

beforeEach(() => {
  files.clear();
});

const siteVariables = {
  base: 'http://localhost',
  basePath: '/course/',
  title: 'Course',
  titlePostfix: ' - Course',
  themeColor: 'black',
  defaultTimeZone: 'America/New_York',
  features: { search: true, favicon: true, footer: true },
  extensionToShikiLanguage: { ts: 'ts' },
} as SiteVariables;

function renderMarkdownPage({
  contentDir,
  relativePath = 'page.md',
  source,
  dependencyCollector,
}: {
  contentDir: string;
  relativePath?: string;
  source: string;
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
    distDir: '/virtual/dist',
    siteVariables,
    validInternalTargets: new Set(),
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
      distDir: '/virtual/dist',
    });

    expect(result).toContain('<link href="/styles.css" rel="stylesheet">');
    expect(result).toContain('<script defer src="/app.js"></script>');
    expect(result).toContain('href="/katex/katex.min.css"');
  });

  test('leaves plain html unchanged when there are no assets and no KaTeX markup', () => {
    const templateHtml =
      '<html><head><meta charset="UTF-8"></head><body><p>Hello</p></body></html>';

    const result = preparePageTemplateHtml({
      templateHtml,
      assetFiles: [],
      distDir: '/virtual/dist',
    });

    expect(result).toBe(templateHtml);
  });
});

describe('renderCodePageAsset', () => {
  test('does not inject the KaTeX stylesheet into code pages', () => {
    const contentDir = '/virtual/content';
    const filePath = path.join(contentDir, 'labs', 'example.ts');
    writeFile(filePath, 'console.log("hello");');

    const [pageAsset] = renderCodePageAsset({
      filePath,
      contentDir,
      distDir: '/virtual/dist',
      siteVariables,
      assetFiles: ['app.js', 'styles.css'],
      validInternalTargets: new Set(),
      literateJavaOutputPaths: new Set(),
    });

    const html = pageAsset.content.toString();

    expect(html).toContain('<link href="/course/styles.css" rel="stylesheet">');
    expect(html).toContain('<script defer="" src="/course/app.js"></script>');
    expect(html).not.toContain('href="/katex/katex.min.css"');
  });
});

describe('renderPlainTextPageAsset', () => {
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

  test('rejects slides front matter on HTML content pages', () => {
    const contentDir = '/virtual/content';
    const filePath = path.join(contentDir, 'slides.html');
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
        distDir: '/virtual/dist',
        siteVariables,
        validInternalTargets: new Set(),
        assetFiles: [],
        literateJavaOutputPaths: new Set(),
      }),
    ).toThrow('slides mode is only supported on Markdown pages');
  });

  test('tracks relative breadcrumb parents from the declaring page', () => {
    const contentDir = '/virtual/content';
    const filePath = path.join(contentDir, 'docs', 'topic', 'page.html');
    writeFile(
      filePath,
      [
        'title: Child page',
        'parent: ../index.html?view=full#overview',
        'parentLabel: Docs',
        '',
        '<p>Hello</p>',
      ].join('\n'),
    );

    const dependencyCollector = { internalTargets: new Set<string>() };

    renderPlainTextPageAsset({
      filePath,
      contentDir,
      distDir: '/virtual/dist',
      siteVariables,
      validInternalTargets: new Set(['/docs/index.html']),
      assetFiles: [],
      literateJavaOutputPaths: new Set(),
      dependencyCollector,
    });

    expect([...dependencyCollector.internalTargets]).toEqual([
      '/docs/index.html',
    ]);
  });

  test('rejects breadcrumb parents without a pathname', () => {
    const contentDir = '/virtual/content';
    const filePath = path.join(contentDir, 'docs', 'topic', 'index.html');
    writeFile(
      filePath,
      [
        'title: Topic index',
        'parent: ?view=full#overview',
        'parentLabel: Topic',
        '',
        '<p>Hello</p>',
      ].join('\n'),
    );

    const dependencyCollector = { internalTargets: new Set<string>() };

    expect(() =>
      renderPlainTextPageAsset({
        filePath,
        contentDir,
        distDir: '/virtual/dist',
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
    ).toThrow('broken parent link');

    expect([...dependencyCollector.internalTargets]).toEqual([]);
  });
});
