import { describe, expect, test } from 'bun:test';
import path from 'path';
import {
  applyEdits,
  exportHtmlPage,
  exportMarkdownPage,
  type ExportContext,
} from './export-markdown';
import type { SiteVariables } from '../types';

const contentDir = path.resolve('site', 'content');

function contentPath(relPath: string): string {
  return path.join(contentDir, ...relPath.split('/'));
}

const siteVariables = {
  base: '',
  basePath: '/',
  internalDomains: [],
  extensionToShikiLanguage: { java: 'java', py: 'python' },
  shikiLanguages: ['java', 'python'],
  features: { search: true, favicon: false, footer: true, pickers: true },
  title: 'Test',
  titlePostfix: ' - Test',
  themeColor: 'steelblue',
  vars: { course: 'CS 101' },
} as unknown as SiteVariables;

function createContext(files: Record<string, string> = {}): ExportContext {
  const read = (filePath: string) => {
    const relPath = path
      .relative(contentDir, filePath)
      .split(path.sep)
      .join('/');
    return files[relPath] ?? null;
  };
  return {
    siteVariables,
    pageTitles: {
      byTitle: new Map([
        ['Linked Lists', ['/lectures/linked lists.html']],
        ['Home', ['/index.html']],
        ['Twin', ['/a.html', '/b.html']],
      ]),
      unlinkableTitles: [],
    },
    exportPaths: new Map([
      ['/index.html', 'index.md'],
      ['/', 'index.md'],
      ['/lectures/linked lists.html', 'lectures/linked lists.md'],
      ['/lectures/index.html', 'lectures/index.md'],
      ['/lectures/', 'lectures/index.md'],
      ['/lectures', 'lectures/index.md'],
      ['/lectures/Demo.java', 'lectures/Demo.java'],
      ['/lectures/Demo.java.html', 'lectures/Demo.java'],
      ['/lectures/photo.png', 'lectures/photo.png'],
      ['/about.html', 'about.html'],
      ['/lectures/a_b.html', 'lectures/a_b.md'],
      ['/lectures/a&b.html', 'lectures/a&b.md'],
    ]),
    validTargets: new Set(['/feed.xml']),
    readFile: read,
    readTraceFile: filePath => {
      const text = read(filePath);
      if (text === null) {
        throw new Error(`trace file not found: ${filePath}`);
      }
      return text;
    },
  };
}

function exportPage(
  body: string,
  {
    relPath = 'lectures/page.md',
    title,
    files,
  }: { relPath?: string; title?: string; files?: Record<string, string> } = {},
): string {
  return exportMarkdownPage(
    createContext(files),
    { filePath: contentPath(relPath), relPath, title },
    body,
  );
}

describe('exportMarkdownPage', () => {
  test('starts with the title as a heading', () => {
    expect(exportPage('\n\nSome text.\n', { title: 'My `Page`' })).toBe(
      '# My `Page`\n\nSome text.\n',
    );
  });

  test('has no heading without a title', () => {
    expect(exportPage('Some text.')).toBe('Some text.\n');
  });

  test('converts wikilinks to relative links', () => {
    expect(
      exportPage('See [[Linked Lists]], [[Home|the *home* page]].', {
        relPath: 'lectures/page.md',
      }),
    ).toBe(
      'See [Linked Lists](linked%20lists.md), [the *home* page](../index.md).\n',
    );
  });

  test('converts wikilinks in table cells', () => {
    expect(
      exportPage('| a | b |\n| - | - |\n| [[Home\\|home]] | [[Home]] |'),
    ).toBe(
      '| a | b |\n| - | - |\n| [home](../index.md) | [Home](../index.md) |\n',
    );
  });

  test('fails on an ambiguous wikilink', () => {
    expect(() => exportPage('[[Twin]]')).toThrow('ambiguous wikilink');
  });

  test('converts superlinks to links followed by the description', () => {
    expect(
      exportPage(
        '[Home][Back to the *front* page](/index.html)\n[Notes][External](https://example.com)',
      ),
    ).toBe(
      '[Home](../index.md) - Back to the *front* page\\\n[Notes](https://example.com) - External\n',
    );
  });

  test('rewrites internal links to exported files', () => {
    expect(
      exportPage(
        [
          '[a](/index.html) [b](../index.html#top) [c](/lectures/index.html)',
          '[d](Demo.java.html) [e](./photo.png) [f](https://example.com/x.html)',
          '[g](#local) [h](/feed.xml) ![i](/lectures/photo.png)',
          '[j](</lectures/linked lists.html>) [k](/about.html "About")',
        ].join('\n'),
      ),
    ).toBe(
      [
        '[a](../index.md) [b](../index.md#top) [c](index.md)',
        '[d](Demo.java) [e](./photo.png) [f](https://example.com/x.html)',
        '[g](#local) [h](../feed.xml) ![i](photo.png)',
        '[j](<linked%20lists.md>) [k](../about.html "About")',
        '',
      ].join('\n'),
    );
  });

  test('fails on a broken internal link, as the build does', () => {
    expect(() => exportPage('[x](/missing.html)')).toThrow(
      'broken internal link: "/missing.html" (resolved to "/missing.html")',
    );
    expect(() => exportPage('<a href="nope.html">x</a>')).toThrow(
      'broken internal link: "nope.html" (resolved to "/lectures/nope.html")',
    );
  });

  test('checks only anchors for broken links, as the build does', () => {
    expect(
      exportPage(
        '![c](/api/chart.svg)\n\n<iframe src="/demo/"></iframe>\n\n[r]: /nowhere.png',
      ),
    ).toBe(
      '![c](../api/chart.svg)\n\n<iframe src="../demo/"></iframe>\n\n[r]: ../nowhere.png\n',
    );
  });

  test('resolves escapes and entities in destinations', () => {
    expect(exportPage('[x](a\\_b.html) [y](a&amp;b.html)')).toBe(
      '[x](a_b.md) [y](a%26b.md)\n',
    );
  });

  test('rewrites a reference destination on the next line of a blockquote', () => {
    expect(exportPage('> [ref]:\n> /index.html\n\n[x][ref]')).toBe(
      '> [ref]:\n> ../index.md\n\n[x][ref]\n',
    );
  });

  test('maps lines indented with tabs', () => {
    expect(exportPage('- item text\n\tcontinued [x](/index.html)')).toBe(
      '- item text\n\tcontinued [x](../index.md)\n',
    );
  });

  test('decodes and escapes HTML attribute values as HTML', () => {
    expect(
      exportPage('<a href="/index.html?q=&quot;a&quot;&amp;b">x</a>'),
    ).toBe('<a href="../index.md?q=&quot;a&quot;&amp;b">x</a>\n');
    expect(() => exportPage('<a href="a\\_b.html">x</a>')).toThrow(
      'broken internal link: "a\\_b.html" (resolved to "/lectures/a\\_b.html")',
    );
  });

  test('escapes rewritten destinations for Markdown', () => {
    expect(exportPage('[x](/index.html#a\\)b) [y](</index.html#a b>)')).toBe(
      '[x](../index.md#a\\)b) [y](<../index.md#a b>)\n',
    );
  });

  test('converts links in the title and joins its lines', () => {
    expect(
      exportPage('Body.', { title: '[Intro](/index.html) and\n[[Home]]' }),
    ).toBe('# [Intro](../index.md) and [Home](../index.md)\n\nBody.\n');
    expect(() => exportPage('Body.', { title: '[x](/nope.html)' })).toThrow(
      'broken internal link: "/nope.html"',
    );
  });

  test('shows alert titles literally, as the build does', () => {
    expect(exportPage('!!! note Use &amp; or ~~old~~\nText.\n!!!')).toBe(
      '> [!NOTE]\n> **Use \\&amp\\; or \\~\\~old\\~\\~**\n>\n> Text.\n',
    );
  });

  test('fails on a directory link, as the build does', () => {
    expect(() => exportPage('[Lectures](/lectures/)')).toThrow(
      'directory link must reference index.html explicitly: "/lectures/" (resolved to "/lectures/", expected "/lectures/index.html")',
    );
  });

  test('rewrites tags that span lines of an HTML block in a blockquote', () => {
    expect(
      exportPage('> <div>\n> <a\n> href="/index.html">x</a>\n> </div>'),
    ).toBe('> <div>\n> <a\n> href="../index.md">x</a>\n> </div>\n');
  });

  test('finds superlink labels as the build does', () => {
    expect(exportPage('[<img alt="]">][Desc](/index.html)')).toBe(
      '[<img alt="]">](../index.md) - Desc\n',
    );
  });

  test('rewrites reference definitions and raw HTML links', () => {
    expect(
      exportPage(
        '[Home][home] and <a href="/index.html">home</a>\n\n[home]: /index.html\n\n<p><img src="/lectures/photo.png"></p>',
      ),
    ).toBe(
      '[Home][home] and <a href="../index.md">home</a>\n\n[home]: ../index.md\n\n<p><img src="photo.png"></p>\n',
    );
  });

  test('leaves code alone', () => {
    const body =
      '`[[Home]]` and `[A][B](/index.html)`\n\n```md\n[[Home]]\n!!! note\n[A][B](/index.html)\n```\n';
    expect(exportPage(body)).toBe(body);
  });

  test('converts alerts to GitHub alerts', () => {
    expect(
      exportPage(
        '!!! note\nA note.\n\nMore.\n!!!\n\n!!! warning Be *careful*\nA warning.\n!!!',
      ),
    ).toBe(
      '> [!NOTE]\n> A note.\n>\n> More.\n\n\n> [!WARNING]\n> **Be \\*careful\\***\n>\n> A warning.\n',
    );
  });

  test('converts alerts nested in lists and alerts', () => {
    expect(
      exportPage(
        '- Item\n\n  !!! warning Title\n  Text.\n  !!!\n\n!!!! note\n!!! warning\nInner.\n!!!\n!!!!',
      ),
    ).toBe(
      '- Item\n\n  > [!WARNING]\n  > **Title**\n  >\n  > Text.\n\n\n> [!NOTE]\n> > [!WARNING]\n> > Inner.\n> \n',
    );
  });

  test('keeps alert markers on rewritten multi-line HTML', () => {
    expect(
      exportPage(
        '!!! note\n<div>\n<a href="/index.html">Home</a>\n</div>\n!!!\n\n!!! note\nSee <a\nhref="/index.html">home</a>.\n!!!',
      ),
    ).toBe(
      '> [!NOTE]\n> <div>\n> <a href="../index.md">Home</a>\n> </div>\n\n\n' +
        '> [!NOTE]\n> See <a\n> href="../index.md">home</a>.\n',
    );
  });

  test('converts questions to details elements', () => {
    expect(
      exportPage(
        '??? question What is `x`?\nThe answer.\n???\n\n??? question Pick one\n- [ ] A\n- [x] B\n???',
      ),
    ).toBe(
      '<details>\n<summary>What is <code>x</code>?</summary>\n\nThe answer.\n\n</details>\n\n' +
        '<details>\n<summary>Pick one</summary>\n\n- [ ] A\n- [x] B\n\n</details>\n',
    );
  });

  test('converts each tab to a details element', () => {
    expect(
      exportPage('[Java|\nJava code.\n]\n[1. *Python*|\nPython code.\n]'),
    ).toBe(
      '<details>\n<summary>Java</summary>\n\nJava code.\n\n</details>\n' +
        '<details>\n<summary>1. <em>Python</em></summary>\n\nPython code.\n\n</details>\n',
    );
  });

  test('removes column fences', () => {
    expect(exportPage('+++\nLeft.\n+++\nRight.\n+++\n\nAfter.')).toBe(
      '\nLeft.\n\nRight.\n\n\nAfter.\n'.replace(/^\n/, ''),
    );
  });

  test('joins heading subtitles with a hyphen', () => {
    expect(exportPage('## Main # Sub\n\n## Use `a # b`\n\nText # here')).toBe(
      '## Main - Sub\n\n## Use `a # b`\n\nText # here\n',
    );
  });

  test('converts definition lists to HTML', () => {
    expect(
      exportPage(
        'Stack\n: Last in, *first* out.\n  More.\n\n[[Home]]\n: Start.\n: Again.',
      ),
    ).toBe(
      [
        '<dl>',
        '<dt>',
        '',
        'Stack',
        '',
        '</dt>',
        '<dd>',
        '',
        'Last in, *first* out.',
        'More.',
        '',
        '</dd>',
        '',
        '<dt>',
        '',
        '[Home](../index.md)',
        '',
        '</dt>',
        '<dd>',
        '',
        'Start.',
        '',
        '</dd>',
        '<dd>',
        '',
        'Again.',
        '',
        '</dd>',
        '</dl>',
        '',
      ].join('\n'),
    );
  });

  test('keeps definitions inside lists and blockquotes', () => {
    expect(
      exportPage('- item\n\n  Term\n  : Def [b](/index.html)\n\n- next'),
    ).toBe(
      '- item\n\n  <dl>\n  <dt>\n\n  Term\n\n  </dt>\n  <dd>\n\n  Def [b](../index.md)\n\n  </dd>\n  </dl>\n\n- next\n',
    );
    expect(exportPage('> Term\n> : Def')).toBe(
      '> <dl>\n> <dt>\n>\n> Term\n>\n> </dt>\n> <dd>\n>\n> Def\n>\n> </dd>\n> </dl>\n',
    );
  });

  test('treats any fence whose first word is trace as a trace', () => {
    expect(
      exportPage('```trace extra\nhelper.py\n```', {
        files: { 'lectures/helper.py': 'x = 1\n' },
      }),
    ).toBe('```python\nx = 1\n```\n');
  });

  test('converts trace blocks to code blocks of their files', () => {
    expect(
      exportPage('- Step\n\n  ```trace\n  Demo.java\n  Helper.java\n  ```', {
        files: {
          'lectures/Demo.java': 'class Demo {\n\n  // ```\n}\n',
          'lectures/Helper.java': 'class Helper {}\n',
        },
      }),
    ).toBe(
      '- Step\n\n  ````java\n  class Demo {\n\n    // ```\n  }\n  ````\n\n  ```java\n  class Helper {}\n  ```\n',
    );
  });

  test('includes partials, nested and inside blocks', () => {
    expect(
      exportPage('> {{{ _intro.md }}}\n\n{{{ sub/_outer.md }}}', {
        files: {
          'lectures/_intro.md': 'Intro for {{ course }}.\n\nSecond [[Home]].',
          'lectures/sub/_outer.md': 'Outer.\n\n{{{ _inner.md }}}',
          'lectures/sub/_inner.md': 'Inner.',
        },
      }),
    ).toBe(
      '> Intro for CS 101.\n>\n> Second [Home](../index.md).\n\nOuter.\n\nInner.\n',
    );
  });

  test('checks trace files as the build does', () => {
    expect(() =>
      exportPage('```trace\nDemo.java\nhelper.py\n```', {
        files: { 'lectures/Demo.java': '', 'lectures/helper.py': '' },
      }),
    ).toThrow('Trace companion must use the same extension as Demo.java');
  });

  test("fails on an empty trace block with the build's message", () => {
    expect(() => exportPage('```trace\n```')).toThrow(
      'trace block must name a source file',
    );
  });

  test('fails on a missing partial', () => {
    expect(() => exportPage('{{{ _missing.md }}}')).toThrow(
      `partial not found: _missing.md (resolved to ${contentPath('lectures/_missing.md')})`,
    );
    expect(() => exportPage('{{{ missing.md }}}')).toThrow(
      'partial not found: missing.md',
    );
  });

  test('keeps the list item of a partial directive', () => {
    expect(
      exportPage('- one\n- {{{ _p.md }}}\n- three', {
        files: { 'lectures/_p.md': 'Partial text' },
      }),
    ).toBe('- one\n- Partial text\n- three\n');
  });

  test('keeps partials apart from the lines around them', () => {
    expect(
      exportPage('Intro text\n{{{ _note.md }}}\nNext line', {
        files: { 'lectures/_note.md': '- Item' },
      }),
    ).toBe('Intro text\n\n- Item\n\nNext line\n');
  });

  test('outdents definitions to their content', () => {
    expect(
      exportPage('Term\n\n:   ```js\n    code\n    ```\n\n    More.'),
    ).toBe(
      '<dl>\n<dt>\n\nTerm\n\n</dt>\n\n<dd>\n\n```js\ncode\n```\n\nMore.\n\n</dd>\n</dl>\n',
    );
  });

  test('rewrites the link in an inline footnote, not its twin', () => {
    expect(
      exportPage('See [docs](/index.html) and ^[[docs](/index.html)]'),
    ).toBe('See [docs](../index.md) and ^[[docs](../index.md)]\n');
  });

  test('leaves URLs in scripts and styles alone', () => {
    expect(
      exportPage(
        `<script>el.innerHTML = '<img src="/index.html">'</script>\n\n<a title="x>y" href="/index.html">a</a>\n\n<style>a { background: url(/index.html) }</style>`,
      ),
    ).toBe(
      `<script>el.innerHTML = '<img src="/index.html">'</script>\n\n<a title="x>y" href="../index.md">a</a>\n\n<style>a { background: url(/index.html) }</style>\n`,
    );
  });
});

describe('exportHtmlPage', () => {
  test('rewrites links inside noscript and fails on broken anchors', () => {
    const page = {
      filePath: contentPath('lectures/page.html'),
      relPath: 'lectures/page.html',
    };
    expect(
      exportHtmlPage(
        createContext(),
        page,
        '<noscript><a href="/index.html">Home</a></noscript><img src="/x.png">',
      ),
    ).toBe(
      '<noscript><a href="../index.md">Home</a></noscript><img src="../x.png">',
    );
    expect(() =>
      exportHtmlPage(createContext(), page, '<a href="/nope.html">x</a>'),
    ).toThrow('broken internal link: "/nope.html"');
  });

  test('adds the title and rewrites links', () => {
    expect(
      exportHtmlPage(
        createContext(),
        {
          filePath: contentPath('lectures/page.html'),
          relPath: 'lectures/page.html',
          title: 'A *page*',
        },
        '\n<p><a href="/index.html">Home</a> <a href="https://x.org/">x</a></p>\n',
      ),
    ).toBe(
      '<h1>A <em>page</em></h1>\n\n<p><a href="../index.md">Home</a> <a href="https://x.org/">x</a></p>\n',
    );
  });
});

describe('applyEdits', () => {
  test('renders nested edits inside the edits that contain them', () => {
    const text = 'abcdef';
    expect(
      applyEdits(text, [
        { start: 1, end: 5, replace: render => `[${render(2, 4)}]` },
        { start: 2, end: 3, replace: () => 'X' },
        { start: 1, end: 1, replace: () => '^' },
        { start: 5, end: 5, replace: () => '$' },
      ]),
    ).toBe('a^[Xd]$f');
  });

  test('rejects overlapping edits', () => {
    expect(() =>
      applyEdits('abcdef', [
        { start: 1, end: 3, replace: () => '' },
        { start: 2, end: 4, replace: () => '' },
      ]),
    ).toThrow('overlapping edits');
  });
});
