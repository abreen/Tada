import { describe, expect, test } from 'bun:test';
import { JSDOM } from 'jsdom';
import { finalizeHtmlPage, stripHtmlComments } from './utils/render';
import type { RenderDependencyCollector, SiteVariables } from './types';

const siteVariables = {
  base: 'https://example.edu',
  basePath: '/course',
  extensionToShikiLanguage: { java: 'java', py: 'python' },
  shikiLanguages: ['java', 'python'],
  internalDomains: [],
  title: 'Test',
  titlePostfix: ' - Test',
  themeColor: 'steelblue',
  defaultTimeZone: 'America/New_York',
  features: { search: true, favicon: true, footer: true },
} as SiteVariables;

function createCollector(): RenderDependencyCollector & {
  internalTargets: Set<string>;
} {
  return { internalTargets: new Set<string>() };
}

describe('finalizeHtmlPage', () => {
  test('rewrites whole-page href and src attributes while collecting content links only', () => {
    const collector = createCollector();

    const html = finalizeHtmlPage({
      filePath: 'content/docs/index.md',
      html: `<!doctype html>
<html>
  <head>
    <link rel="icon" href="/favicon.ico">
  </head>
  <body>
    <nav><a href="/nav.html">Nav</a></nav>
    <main class="body">
      <a href="/about.html">About</a>
      <a href="guide.html">Guide</a>
      <img src="/img/pic.png" alt="Pic">
    </main>
  </body>
</html>`,
      siteVariables,
      sourceUrlPath: '/docs/index.html',
      validInternalTargets: new Set(['/about.html', '/docs/guide.html']),
      dependencyCollector: collector,
    });

    expect(html).toContain('href="/course/favicon.ico"');
    expect(html).toContain('href="/course/nav.html"');
    expect(html).toContain('href="/course/about.html"');
    expect(html).toContain('href="guide.html"');
    expect(html).toContain('src="/course/img/pic.png"');
    expect([...collector.internalTargets]).toEqual([
      '/about.html',
      '/docs/guide.html',
    ]);
  });

  test('rewrites content code links to generated html pages', () => {
    const collector = createCollector();

    const html = finalizeHtmlPage({
      filePath: 'content/docs/index.md',
      html: `<!doctype html><html><body><main class="body"><a href="./App.java">App</a></main></body></html>`,
      siteVariables,
      sourceUrlPath: '/docs/index.html',
      validInternalTargets: new Set(['/docs/App.java.html']),
      dependencyCollector: collector,
    });

    expect(html).toContain('href="./App.java.html"');
    expect([...collector.internalTargets]).toEqual(['/docs/App.java.html']);
  });

  test('preserves raw code download links when only the copied source exists', () => {
    const collector = createCollector();

    const html = finalizeHtmlPage({
      filePath: 'content/docs/index.md',
      html: `<!doctype html><html><body><main class="body"><a href="./App.java">App</a></main></body></html>`,
      siteVariables,
      sourceUrlPath: '/docs/index.html',
      validInternalTargets: new Set(['/docs/App.java']),
      dependencyCollector: collector,
    });

    expect(html).toContain('href="./App.java"');
    expect(html).not.toContain('href="./App.java.html"');
    expect([...collector.internalTargets]).toEqual(['/docs/App.java']);
  });

  test('preserves literate Java source downloads even when an html page also exists', () => {
    const collector = createCollector();

    const html = finalizeHtmlPage({
      filePath: 'content/docs/index.md',
      html: `<!doctype html><html><body><main class="body"><a href="./Pair.java">Pair</a></main></body></html>`,
      siteVariables,
      sourceUrlPath: '/docs/index.html',
      validInternalTargets: new Set([
        '/docs/Pair.java',
        '/docs/Pair.java.html',
      ]),
      dependencyCollector: collector,
      literateJavaOutputPaths: new Set(['/docs/Pair.java']),
    });

    expect(html).toContain('href="./Pair.java"');
    expect(html).not.toContain('href="./Pair.java.html"');
    expect([...collector.internalTargets]).toEqual(['/docs/Pair.java']);
  });

  test('does not rewrite download anchors to code pages', () => {
    const collector = createCollector();

    const html = finalizeHtmlPage({
      filePath: 'content/docs/App.java',
      html: `<!doctype html><html><body><main class="body"><a href="/docs/App.java" download>Download</a></main></body></html>`,
      siteVariables,
      sourceUrlPath: '/docs/App.java.html',
      validInternalTargets: new Set(['/docs/App.java', '/docs/App.java.html']),
      dependencyCollector: collector,
    });

    expect(html).toContain('href="/course/docs/App.java"');
    expect(html).not.toContain('.java.html" download');
    expect([...collector.internalTargets]).toEqual(['/docs/App.java']);
  });

  test('throws for broken internal links in rendered page content', () => {
    expect(() =>
      finalizeHtmlPage({
        filePath: 'content/docs/index.md',
        html: `<!doctype html><html><body><main class="body"><a href="/missing.html">Missing</a></main></body></html>`,
        siteVariables,
        sourceUrlPath: '/docs/index.html',
        validInternalTargets: new Set(['/about.html']),
      }),
    ).toThrow('broken internal link');
  });

  test('throws when a directory link omits index.html', () => {
    expect(() =>
      finalizeHtmlPage({
        filePath: 'content/docs/index.md',
        html: `<!doctype html><html><body><main class="body"><a href="/docs">Docs</a></main></body></html>`,
        siteVariables,
        sourceUrlPath: '/docs/index.html',
        validInternalTargets: new Set(['/docs/index.html']),
      }),
    ).toThrow('directory link must reference index.html explicitly');
  });

  test('preserves staff table structure while rewriting image paths after comment stripping', () => {
    const content = stripHtmlComments(
      [
        '<table class="staff">',
        '<thead>',
        '<tr>',
        '    <th></th>',
        '    <th>name &amp; contact info.</th>',
        '    <th>office hours</th>',
        '</tr>',
        '</thead>',
        '<tbody>',
        '<tr>',
        '  <td><img src="/img/staff/ajb.jpg"></td>',
        '  <td>Alex Breen<br><tt>abreen@fas.harvard.edu</tt></td>',
        '  <td>Tuesdays, 12-1 pm Eastern time;<br>',
        '      after the Wed. 5:30-6:30 pm section (see below)',
        '  </td>',
        '</tr>',
        '',
        '<tr>',
        '  <td><img src="/img/staff/libby.jpg"></td>',
        '  <td>Libby James<br><tt>etjames@bu.edu</tt></td>',
        '  <td>Mondays, 5:30-6:30 pm Eastern time;<br>',
        '      after the Thurs. 5:30-6:30 pm section (see below)',
        '  </td>',
        '</tr>',
        '',
        '<tr>',
        '  <td><img src="/img/staff/eli.jpg"></td>',
        '  <td>Eli Saracino<br><tt>esaracin@bu.edu</tt></td>',
        '  <td>Sundays, 12-1 pm Eastern time;<br>',
        '      after the Wed. 7:30-8:30 pm section (see below)',
        '  </td>',
        '</tr>',
        '',
        '<!---',
        '<tr>',
        '  <td><img src="/img/staff/ash.png"></td>',
        '  <td>Ashby Hobart<br><tt>ahobart@bu.edu</tt></td>',
        '  <td>Mondays, 7:30-8:30 pm Eastern time;<br>',
        '      after the Thurs. 7:30-8:30 pm section (see below)',
        '  </td>',
        '</tr>',
        '-->',
        '</tbody>',
        '</table>',
      ].join('\n'),
    );

    const html = finalizeHtmlPage({
      filePath: 'content/index.md',
      html: `<!doctype html><html><body><main class="body">${content}</main></body></html>`,
      siteVariables,
      sourceUrlPath: '/index.html',
      validInternalTargets: new Set(),
    });

    const dom = new JSDOM(html);
    const table = dom.window.document.querySelector('table.staff');

    expect(table).not.toBeNull();
    expect(table!.querySelectorAll('tr')).toHaveLength(4);
    expect(table!.querySelectorAll('td')).toHaveLength(9);
    expect(
      table!.querySelectorAll('img[src^="/course/img/staff/"]'),
    ).toHaveLength(3);
  });
});
