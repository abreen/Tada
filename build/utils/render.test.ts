import path from 'path';
import { describe, expect, mock, test } from 'bun:test';
import realFs from 'fs';
import type { SiteVariables } from '../types';

const mockedSourcePath = '/virtual/content/example.ts';

mock.module('fs', () => ({
  default: {
    ...realFs,
    readFileSync(filePath: string, encoding?: BufferEncoding) {
      if (filePath === mockedSourcePath && encoding === 'utf-8') {
        return 'const answer = 42;\n';
      }
      return realFs.readFileSync(filePath, encoding as BufferEncoding);
    },
    existsSync(filePath: string) {
      if (
        typeof filePath === 'string' &&
        (filePath.endsWith('inter/InterVariable.woff2') ||
          filePath.endsWith('google-sans-code/GoogleSansCodeVariable.woff2'))
      ) {
        return false;
      }
      return realFs.existsSync(filePath);
    },
  },
}));

mock.module('../templates', () => ({
  json: () => undefined,
  render: (templateName: string) => {
    if (templateName === 'code.html') {
      return '<html><head><meta charset="UTF-8"></head><body><span class="katex">code page</span></body></html>';
    }
    return '<html><head><meta charset="UTF-8"></head><body></body></html>';
  },
}));

mock.module('./final-html', () => ({
  finalizeHtmlPage: ({ html }: { html: string }) => ({
    html,
    analysis: { outgoingTargets: new Set<string>() },
  }),
}));

const { preparePageTemplateHtml, renderCodePageAsset } =
  await import('./render');

const siteVariables = {
  base: 'http://localhost',
  basePath: '/',
  title: 'Site',
  titlePostfix: ' - Site',
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
      distDir: '/tmp/render-test-dist',
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
      distDir: '/tmp/render-test-dist',
    });

    expect(result).toBe(templateHtml);
  });
});

describe('renderCodePageAsset', () => {
  test('does not inject the KaTeX stylesheet into code pages', () => {
    const [pageAsset] = renderCodePageAsset({
      filePath: mockedSourcePath,
      contentDir: path.dirname(path.dirname(mockedSourcePath)),
      distDir: '/tmp/render-test-dist',
      siteVariables,
      assetFiles: ['app.js', 'styles.css'],
      validInternalTargets: new Set(),
      literateJavaOutputPaths: new Set(),
    });

    const html = pageAsset.content.toString();

    expect(html).toContain('<link href="/styles.css" rel="stylesheet">');
    expect(html).toContain('<script defer src="/app.js"></script>');
    expect(html).not.toContain('href="/katex/katex.min.css"');
  });
});
