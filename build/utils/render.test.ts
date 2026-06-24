import { beforeAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import path from 'path';
import { createFsModuleMock } from '../test-helpers';
import type {
  RenderPlainTextOptions,
  SiteVariables,
  TraceToolAvailability,
} from '../types';
import { initHighlighter } from './shiki-highlighter';

const files = new Map<string, string>();
let mockedCodeHtml = '<div class="code-body">rendered code</div>';
let renderedCodeSource = '';
let renderedCodeFilePath: string | undefined;
let renderedCodeDependencyCollector: unknown;

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
  renderCodeWithComments(
    source: string,
    _language: string,
    _siteVariables: SiteVariables,
    _pageDirPath?: string,
    filePath?: string,
    dependencyCollector?: unknown,
  ) {
    renderedCodeSource = source;
    renderedCodeFilePath = filePath;
    renderedCodeDependencyCollector = dependencyCollector;
    return mockedCodeHtml;
  },
  rewriteProseLinks(lines: string[]) {
    return lines;
  },
}));

let preparePageTemplateHtml: typeof import('./render').preparePageTemplateHtml;
let renderCodePageAsset: typeof import('./render').renderCodePageAsset;
let renderPlainTextPageAsset: typeof import('./render').renderPlainTextPageAsset;

beforeAll(async () => {
  await initHighlighter(['text', 'java', 'ts']);
  ({ preparePageTemplateHtml, renderCodePageAsset, renderPlainTextPageAsset } =
    await import('./render'));
});

beforeEach(() => {
  files.clear();
  mockedCodeHtml = '<div class="code-body">rendered code</div>';
  renderedCodeSource = '';
  renderedCodeFilePath = undefined;
  renderedCodeDependencyCollector = undefined;
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
  shikiLanguages: ['ts'],
  vars: { course: 'CSCI E-22' },
} as SiteVariables;

function renderMarkdownPage({
  contentDir,
  relativePath = 'page.md',
  source,
  dependencyCollector,
  traceCache,
  traceToolAvailability,
}: {
  contentDir: string;
  relativePath?: string;
  source: string;
  dependencyCollector?: {
    partials?: Set<string>;
    internalTargets?: Set<string>;
    traceFiles?: Set<string>;
  };
  traceCache?: NonNullable<RenderPlainTextOptions['traceCache']>;
  traceToolAvailability?: TraceToolAvailability;
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
    traceCache,
    traceToolAvailability,
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

  test('injects the KaTeX stylesheet into code pages with math', () => {
    mockedCodeHtml =
      '<div class="code-prose"><span class="katex">x</span></div>';
    const contentDir = '/virtual/content';
    const filePath = path.join(contentDir, 'labs', 'example.java');
    writeFile(filePath, '/// $x$\npublic class Example {}\n');

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

    expect(html).toContain('href="/course/katex/katex.min.css"');
  });

  test('passes raw Java prose expressions to the MDX renderer', () => {
    const contentDir = '/virtual/content';
    const filePath = path.join(contentDir, 'labs', 'example.java');
    const source = '/// {vars.course}\npublic class Example {}\n';
    writeFile(filePath, source);

    renderCodePageAsset({
      filePath,
      contentDir,
      distDir: '/virtual/dist',
      siteVariables: { ...siteVariables, vars: { course: '*literal*' } },
      assetFiles: [],
      validInternalTargets: new Set(),
      literateJavaOutputPaths: new Set(),
    });

    expect(renderedCodeSource).toBe(source);
  });

  test('passes Java source context to the MDX renderer', () => {
    const contentDir = '/virtual/content';
    const filePath = path.join(contentDir, 'labs', 'example.java');
    const dependencyCollector = { partials: new Set<string>() };
    writeFile(filePath, '/// <Partial source="_notes.md" />\n');

    renderCodePageAsset({
      filePath,
      contentDir,
      distDir: '/virtual/dist',
      siteVariables,
      assetFiles: [],
      validInternalTargets: new Set(),
      literateJavaOutputPaths: new Set(),
      dependencyCollector,
    });

    expect(renderedCodeFilePath).toBe(filePath);
    expect(renderedCodeDependencyCollector).toBe(dependencyCollector);
  });
});

describe('renderPlainTextPageAsset', () => {
  test('renders an MDX page to the same output path shape as Markdown', () => {
    const contentDir = '/virtual/content';
    const filePath = path.join(contentDir, 'docs', 'page.mdx');
    writeFile(filePath, '---\ntitle: MDX Output\n---\n\n# Hello');

    const [pageAsset] = renderPlainTextPageAsset({
      filePath,
      contentDir,
      distDir: '/virtual/dist',
      siteVariables,
      validInternalTargets: new Set(),
      assetFiles: [],
      literateJavaOutputPaths: new Set(),
    });

    expect(pageAsset.assetPath).toBe('docs/page.html');
    expect(pageAsset.content.toString()).toContain('<h1 id="hello">Hello</h1>');
  });

  test('renders recursive MDX partial components relative to their files', () => {
    const contentDir = '/virtual/content';
    writeFile(
      path.join(contentDir, '_outer.md'),
      'Outer {vars.course}.\n\n<Partial source="subdir/_inner.mdx" />',
    );
    writeFile(
      path.join(contentDir, 'subdir', '_inner.mdx'),
      'Inner **content**.',
    );
    const dependencyCollector = { partials: new Set<string>() };

    const html = renderMarkdownPage({
      contentDir,
      source: '---\ntitle: Partial Test\n---\n\n<Partial source="_outer.md" />',
      dependencyCollector,
    });

    expect(html).toContain('Outer CSCI E-22.');
    expect(html).toContain('Inner <strong>content</strong>.');
    expect([...dependencyCollector.partials]).toEqual([
      path.resolve(contentDir, '_outer.md'),
      path.resolve(contentDir, 'subdir', '_inner.mdx'),
    ]);
  });

  test('validates partial paths, children, cycles, and depth', () => {
    const contentDir = '/virtual/content';
    writeFile(
      path.join(contentDir, '_cycle.md'),
      '<Partial source="_cycle.md" />',
    );

    expect(() =>
      renderMarkdownPage({
        contentDir,
        source: '---\ntitle: Missing\n---\n\n<Partial source="_missing.md" />',
      }),
    ).toThrow('partial not found');
    expect(() =>
      renderMarkdownPage({
        contentDir,
        source: '---\ntitle: Bad\n---\n\n<Partial source="page.md" />',
      }),
    ).toThrow('must start with "_"');
    expect(() =>
      renderMarkdownPage({
        contentDir,
        source: '---\ntitle: Bad\n---\n\n<Partial source="_partial.html" />',
      }),
    ).toThrow('must be a .md, .markdown, or .mdx file');
    expect(() =>
      renderMarkdownPage({
        contentDir,
        source:
          '---\ntitle: Bad\n---\n\n<Partial source="_cycle.md">No</Partial>',
      }),
    ).toThrow('<Partial> does not accept children');
    expect(() =>
      renderMarkdownPage({
        contentDir,
        source: '---\ntitle: Cycle\n---\n\n<Partial source="_cycle.md" />',
      }),
    ).toThrow('partial cycle');
  });

  test('renders the MDX TimeZoneChooser component', () => {
    const html = renderMarkdownPage({
      contentDir: '/virtual/content',
      relativePath: 'timezone.mdx',
      source: '---\ntitle: Time Zone\n---\n\n<TimeZoneChooser />\n',
    });

    expect(html).toContain('class="time-zone"');
    expect(html).toContain('Times shown in ET.');
  });

  test('highlights fenced code through the MDX component runtime', () => {
    const html = renderMarkdownPage({
      contentDir: '/virtual/content',
      source: '---\ntitle: Code\n---\n\n```ts\nconst answer = 42;\n```\n',
    });

    expect(html).toContain('<pre class="shiki');
    expect(html).toContain('answer');
  });

  test('binds page values in MDX expressions', () => {
    const html = renderMarkdownPage({
      contentDir: '/virtual/content',
      source: '---\ntitle: MDX Title\n---\n\n# {page.title}\n',
    });

    expect(html).toContain('<h1 id="mdx-title">MDX Title</h1>');
  });

  test('renders JSX components from .md pages', () => {
    const html = renderMarkdownPage({
      contentDir: '/virtual/content',
      source: '---\ntitle: Time Zone\n---\n\n<TimeZoneChooser />\n',
    });

    expect(html).toContain('class="time-zone"');
  });

  test('resolves structured expressions in front matter', () => {
    const contentDir = '/virtual/content';
    const filePath = path.join(contentDir, 'page.md');
    writeFile(
      filePath,
      '---\ntitle: "Course {vars.course}"\nmetadata: "{site.features}"\n---\n\n# {page.title}',
    );

    const [pageAsset] = renderPlainTextPageAsset({
      filePath,
      contentDir,
      distDir: '/virtual/dist',
      siteVariables,
      validInternalTargets: new Set(),
      assetFiles: [],
      literateJavaOutputPaths: new Set(),
    });

    expect(pageAsset.content.toString()).toContain(
      '<h1 id="course-csci-e-22">Course CSCI E-22</h1>',
    );
  });

  test('renders the MDX Trace component through the existing trace helper', () => {
    const contentDir = '/virtual/content';
    const sourcePath = path.join(contentDir, 'Demo.java');
    const companionPath = path.join(contentDir, 'Helper.java');
    writeFile(
      sourcePath,
      'class Demo { public static void main(String[] args) {} }\n',
    );
    writeFile(companionPath, 'class Helper {}\n');
    const dependencyCollector = { traceFiles: new Set<string>() };

    const html = renderMarkdownPage({
      contentDir,
      relativePath: 'trace.mdx',
      source: [
        '---',
        'title: Trace',
        '---',
        '',
        '<Trace source="Demo.java" companions={["Helper.java"]} />',
        '',
      ].join('\n'),
      dependencyCollector,
      traceCache: new Map(),
      traceToolAvailability: { java: false },
    });

    expect(html).toContain('trace-widget trace-disabled');
    expect(html).toContain('Demo.java');
    expect(html).toContain('Helper.java');
    expect([...dependencyCollector.traceFiles]).toEqual([
      path.resolve(sourcePath),
      path.resolve(companionPath),
    ]);
  });

  test('validates MDX Trace props before rendering', () => {
    expect(() =>
      renderMarkdownPage({
        contentDir: '/virtual/content',
        relativePath: 'trace.mdx',
        source: '---\ntitle: Trace\n---\n\n<Trace />\n',
        traceCache: new Map(),
      }),
    ).toThrow('<Trace> requires a string "source" prop');

    expect(() =>
      renderMarkdownPage({
        contentDir: '/virtual/content',
        relativePath: 'trace.mdx',
        source:
          '---\ntitle: Trace\n---\n\n<Trace source="Demo.java" companions="Helper.java" />\n',
        traceCache: new Map(),
      }),
    ).toThrow('"companions" prop must be an array of strings');

    expect(() =>
      renderMarkdownPage({
        contentDir: '/virtual/content',
        relativePath: 'trace.mdx',
        source:
          '---\ntitle: Trace\n---\n\n<Trace source="Demo.java" unknown="x" />\n',
        traceCache: new Map(),
      }),
    ).toThrow('<Trace> does not accept "unknown"');
  });

  test('rejects MDX import and export statements', () => {
    expect(() =>
      renderMarkdownPage({
        contentDir: '/virtual/content',
        relativePath: 'bad.mdx',
        source: '---\ntitle: Bad MDX\n---\n\nimport x from "./x.js"\n\n# Hi\n',
      }),
    ).toThrow('MDX import/export statements are not supported');

    expect(() =>
      renderMarkdownPage({
        contentDir: '/virtual/content',
        relativePath: 'bad.mdx',
        source: '---\ntitle: Bad MDX\n---\n\nexport const x = 1\n\n# Hi\n',
      }),
    ).toThrow('MDX import/export statements are not supported');
  });

  test('rejects legacy slides front matter with a component migration', () => {
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
    ).toThrow('use <Slides> and <Slide> components');
  });

  test('tracks relative breadcrumb parents from the declaring page', () => {
    const contentDir = '/virtual/content';
    const filePath = path.join(contentDir, 'docs', 'topic', 'page.html');
    writeFile(
      filePath,
      [
        '---',
        'title: Child page',
        'parent: ../index.html?view=full#overview',
        'parentLabel: Docs',
        '---',
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
        '---',
        'title: Topic index',
        'parent: ?view=full#overview',
        'parentLabel: Topic',
        '---',
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
