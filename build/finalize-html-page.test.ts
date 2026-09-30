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
  features: { search: true, favicon: true, footer: true, pickers: true },
} as SiteVariables;

function createCollector(): RenderDependencyCollector & {
  internalTargets: Set<string>;
} {
  return { internalTargets: new Set<string>() };
}

describe('finalizeHtmlPage', () => {
  test('rewrites whole-page href and src attributes while collecting all clickable content links', () => {
    const collector = createCollector();

    const result = finalizeHtmlPage({
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
      <a href="/docs/guide.pdf">Guide PDF</a>
      <a class="disabled" href="/ignore.html">Ignore</a>
      <img src="/img/pic.png" alt="Pic">
      </main>
  </body>
</html>`,
      siteVariables,
      sourceUrlPath: '/docs/index.html',
      validInternalTargets: new Set([
        '/about.html',
        '/docs/guide.html',
        '/docs/guide.pdf',
        '/ignore.html',
      ]),
      dependencyCollector: collector,
    });

    expect(result.html).toContain('href="/course/favicon.ico"');
    expect(result.html).toContain('href="/course/nav.html"');
    expect(result.html).toContain('href="/course/about.html"');
    expect(result.html).toContain('href="guide.html"');
    expect(result.html).toContain('href="/course/docs/guide.pdf"');
    expect(result.html).toContain('href="/course/ignore.html"');
    expect(result.html).toContain('src="/course/img/pic.png"');
    expect([...result.analysis.outgoingTargets].sort()).toEqual([
      '/about.html',
      '/docs/guide.html',
      '/docs/guide.pdf',
      '/ignore.html',
      '/nav.html',
    ]);
    expect([...collector.internalTargets]).toEqual([
      '/about.html',
      '/docs/guide.html',
      '/docs/guide.pdf',
      '/ignore.html',
    ]);
  });

  test('throws for broken internal links even when styled with the disabled class', () => {
    expect(() =>
      finalizeHtmlPage({
        filePath: 'content/docs/index.md',
        html: `<!doctype html><html><body><main class="body"><a class="disabled" href="/missing.html">Missing</a></main></body></html>`,
        siteVariables,
        sourceUrlPath: '/docs/index.html',
        validInternalTargets: new Set(['/about.html']),
      }),
    ).toThrow('broken internal link');
  });

  test('does not emit meta refresh as a reachability target', () => {
    const result = finalizeHtmlPage({
      filePath: 'content/index.html',
      html: `<!doctype html><html><head><meta http-equiv="refresh" content="0; url='/redirect/'"></head><body><main class="body"><a href="/about.html">About</a></main></body></html>`,
      siteVariables,
      sourceUrlPath: '/index.html',
      validInternalTargets: new Set(['/about.html', '/redirect/index.html']),
    });

    expect([...result.analysis.outgoingTargets]).toEqual(['/about.html']);
  });

  test('rewrites content code links to generated html pages', () => {
    const collector = createCollector();

    const result = finalizeHtmlPage({
      filePath: 'content/docs/index.md',
      html: `<!doctype html><html><body><main class="body"><a href="./App.java">App</a></main></body></html>`,
      siteVariables,
      sourceUrlPath: '/docs/index.html',
      validInternalTargets: new Set(['/docs/App.java.html']),
      dependencyCollector: collector,
    });

    expect(result.html).toContain('href="./App.java.html"');
    expect([...result.analysis.outgoingTargets]).toEqual([
      '/docs/App.java.html',
    ]);
    expect([...collector.internalTargets]).toEqual(['/docs/App.java.html']);
  });

  test('preserves raw code download links when only the copied source exists', () => {
    const collector = createCollector();

    const result = finalizeHtmlPage({
      filePath: 'content/docs/index.md',
      html: `<!doctype html><html><body><main class="body"><a href="./App.java">App</a></main></body></html>`,
      siteVariables,
      sourceUrlPath: '/docs/index.html',
      validInternalTargets: new Set(['/docs/App.java']),
      dependencyCollector: collector,
    });

    expect(result.html).toContain('href="./App.java"');
    expect(result.html).not.toContain('href="./App.java.html"');
    expect([...result.analysis.outgoingTargets]).toEqual(['/docs/App.java']);
    expect([...collector.internalTargets]).toEqual(['/docs/App.java']);
  });

  test('preserves literate Java source downloads even when an html page also exists', () => {
    const collector = createCollector();

    const result = finalizeHtmlPage({
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

    expect(result.html).toContain('href="./Pair.java"');
    expect(result.html).not.toContain('href="./Pair.java.html"');
    expect([...result.analysis.outgoingTargets]).toEqual(['/docs/Pair.java']);
    expect([...collector.internalTargets]).toEqual(['/docs/Pair.java']);
  });

  test('does not rewrite download anchors to code pages', () => {
    const collector = createCollector();

    const result = finalizeHtmlPage({
      filePath: 'content/docs/App.java',
      html: `<!doctype html><html><body><main class="body"><a href="/docs/App.java" download>Download</a></main></body></html>`,
      siteVariables,
      sourceUrlPath: '/docs/App.java.html',
      validInternalTargets: new Set(['/docs/App.java', '/docs/App.java.html']),
      dependencyCollector: collector,
    });

    expect(result.html).toContain('href="/course/docs/App.java"');
    expect(result.html).not.toContain('.java.html" download');
    expect([...result.analysis.outgoingTargets]).toEqual(['/docs/App.java']);
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

    const result = finalizeHtmlPage({
      filePath: 'content/index.md',
      html: `<!doctype html><html><body><main class="body">${content}</main></body></html>`,
      siteVariables,
      sourceUrlPath: '/index.html',
      validInternalTargets: new Set(),
    });

    const dom = new JSDOM(result.html);
    const table = dom.window.document.querySelector('table.staff');

    expect(table).not.toBeNull();
    expect(table!.querySelectorAll('tr')).toHaveLength(4);
    expect(table!.querySelectorAll('td')).toHaveLength(9);
    expect(
      table!.querySelectorAll('img[src^="/course/img/staff/"]'),
    ).toHaveLength(3);
  });
});

test.each([
  '/notes#1/page.html',
  '/notes?1/page.html',
  '/notes%231/code.py.html',
  '/notes%3F1/code.py.html',
])('classifies relative links against source pathname %s', sourceUrlPath => {
  const collector = createCollector();
  const directory =
    sourceUrlPath.includes('#') || sourceUrlPath.includes('%23')
      ? '/notes#1'
      : '/notes?1';
  const target = `${directory}/destination.html`;
  const result = finalizeHtmlPage({
    filePath: 'content/page.md',
    html: '<nav><a href="destination.html?query=1#part">Destination</a></nav>',
    siteVariables,
    sourceUrlPath,
    validInternalTargets: new Set([target]),
    generatedPageTargets: new Set([target, '/destination.html']),
    dependencyCollector: collector,
  });
  const anchor = new JSDOM(result.html).window.document.querySelector('a')!;
  expect(anchor.hasAttribute('data-tada-page')).toBe(true);
  expect(anchor.getAttribute('href')).toBe('destination.html?query=1#part');
  expect([...collector.internalTargets]).toEqual([target]);
});

test('annotates generated destinations throughout the document and removes reserved markers', () => {
  const collector = createCollector();
  const result = finalizeHtmlPage({
    filePath: 'content/docs/index.md',
    html: `<nav><a href="guide%20one.html?x=1#part">Relative</a>
      <a href="https://example.edu/course/docs/guide%20one.html">Absolute</a>
      <a href="/copied.html" data-tada-page>Copied</a>
      <a href="/docs/guide%20one.html" download data-tada-page>Download</a>
      <a href="/docs/guide%20one.html" target="_self" data-tada-page>Target</a></nav>`,
    siteVariables,
    sourceUrlPath: '/docs/index.html',
    validInternalTargets: new Set(['/copied.html', '/docs/guide one.html']),
    generatedPageTargets: new Set(['/docs/guide one.html']),
    dependencyCollector: collector,
  });
  const anchors = new JSDOM(result.html).window.document.querySelectorAll('a');
  expect(Array.from(anchors, a => a.hasAttribute('data-tada-page'))).toEqual([
    true,
    true,
    false,
    false,
    false,
  ]);
  expect(anchors[0].getAttribute('href')).toBe('guide%20one.html?x=1#part');
  expect(collector.internalTargets.has('/copied.html')).toBe(true);
});
