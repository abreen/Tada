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
    ]),
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
          '[a](/index.html) [b](../index.html#top) [c](/lectures/)',
          '[d](Demo.java.html) [e](./photo.png) [f](https://example.com/x.html)',
          '[g](#local) [h](/missing/page.html) ![i](/lectures/photo.png)',
          '[j](</lectures/linked lists.html>) [k](/about.html "About")',
        ].join('\n'),
      ),
    ).toBe(
      [
        '[a](../index.md) [b](../index.md#top) [c](index.md)',
        '[d](Demo.java) [e](./photo.png) [f](https://example.com/x.html)',
        '[g](#local) [h](../missing/page.html) ![i](photo.png)',
        '[j](<linked%20lists.md>) [k](../about.html "About")',
        '',
      ].join('\n'),
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

  test('converts trace blocks to code blocks of their files', () => {
    expect(
      exportPage('- Step\n\n  ```trace\n  Demo.java\n  helper.py\n  ```', {
        files: {
          'lectures/Demo.java': 'class Demo {\n\n  // ```\n}\n',
          'lectures/helper.py': 'x = 1\n',
        },
      }),
    ).toBe(
      '- Step\n\n  ````java\n  class Demo {\n\n    // ```\n  }\n  ````\n\n  ```python\n  x = 1\n  ```\n',
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

  test('fails on a missing partial', () => {
    expect(() => exportPage('{{{ _missing.md }}}')).toThrow(
      'partial not found: _missing.md',
    );
  });
});

describe('exportHtmlPage', () => {
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
