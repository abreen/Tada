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
  json() {
    return undefined;
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
