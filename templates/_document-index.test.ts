import { describe, expect, test } from 'bun:test';
import { compileTemplate } from '../build/lodash-template';
import { encodeAuthoredUrl } from '../build/template-globals';
import type {
  DocumentLink,
  DocumentNavigation,
  DocumentTreeEntry,
} from '../build/document-index';
import INDEX_TEMPLATE from './_document-index.html' with { type: 'text' };
import PAGINATION_TEMPLATE from './_document-pagination.html' with { type: 'text' };

function link(title: string, href: string, isCodePage = false): DocumentLink {
  return { title, titleHtml: title, href, isCodePage };
}

function entry(
  title: string,
  href: string,
  options: Partial<DocumentTreeEntry> = {},
): DocumentTreeEntry {
  return {
    ...link(title, href),
    current: false,
    isBranch: false,
    children: [],
    ...options,
  };
}

function render(
  template: string,
  documentNavigation: DocumentNavigation | undefined,
): string {
  return compileTemplate(template)({
    page: { documentNavigation },
    encodeAuthoredUrl,
  }).replace(/\s+</g, '<');
}

const NAVIGATION: DocumentNavigation = {
  indexFile: 'content/index.yml',
  ancestors: [link('Guide', '/index.html')],
  tree: entry('Guide', '/index.html', {
    isBranch: true,
    children: [
      entry('Install', '/install.html', {
        current: true,
        isBranch: true,
        children: [entry('Deep', '/deep.html')],
      }),
      entry('Topics', '/topics/index.html', { isBranch: true }),
      entry('<code>a b</code>', '/a%20b.html'),
      entry('<code>Foo.java</code>', '/Foo.java.html', { isCodePage: true }),
    ],
  }),
  previous: link('Guide', '/index.html'),
  next: link('<em>Deep</em>', '/deep.html'),
};

describe('_document-index.html', () => {
  test('renders nothing for a page outside every index', () => {
    expect(render(INDEX_TEMPLATE, undefined).trim()).toBe('');
  });

  test('renders the shown tree as nested lists', () => {
    const html = render(INDEX_TEMPLATE, NAVIGATION);
    expect(html).toStartWith(
      '<nav class="document-index" aria-label="Document navigation" data-pagefind-ignore><ol><li class="document-index-branch document-index-branch-open"><a href="/index.html">Guide</a><ol>',
    );
    expect(html).toContain(
      '<li class="document-index-branch document-index-branch-open"><a href="/install.html" aria-current="page">Install</a><ol><li><a href="/deep.html">Deep</a></li></ol></li>',
    );
    // A branch whose children are not shown
    expect(html).toContain(
      '<li class="document-index-branch"><a href="/topics/index.html">Topics</a></li>',
    );
    expect(html.match(/aria-current/g)).toHaveLength(1);
  });

  test('keeps title HTML and existing URL escapes', () => {
    const html = render(INDEX_TEMPLATE, NAVIGATION);
    expect(html).toContain('<a href="/a%20b.html"><code>a b</code></a>');
  });

  test('marks code pages', () => {
    const html = render(INDEX_TEMPLATE, NAVIGATION);
    expect(html).toContain(
      '<a class="code-page" href="/Foo.java.html"><code>Foo.java</code></a>',
    );
  });
});

describe('_document-pagination.html', () => {
  test('links to the previous and next pages as buttons', () => {
    const html = render(PAGINATION_TEMPLATE, NAVIGATION);
    expect(html).toContain(
      '<a class="button previous" rel="prev" href="/index.html"><span class="mask-icon mask-icon-breadcrumb-separator" aria-hidden="true"></span><span class="title"><span class="visually-hidden">Previous:</span>Guide</span></a>',
    );
    expect(html).toContain(
      '<a class="button next" rel="next" href="/deep.html"><span class="title"><span class="visually-hidden">Next:</span><em>Deep</em></span><span class="mask-icon mask-icon-breadcrumb-separator" aria-hidden="true"></span></a>',
    );
  });

  test('marks a code page title', () => {
    const html = render(PAGINATION_TEMPLATE, {
      ...NAVIGATION,
      next: link('<code>Foo.java</code>', '/Foo.java.html', true),
    });
    expect(html).toContain(
      '<span class="title code-page"><span class="visually-hidden">Next:</span><code>Foo.java</code></span>',
    );
  });

  test('omits a missing direction', () => {
    const html = render(PAGINATION_TEMPLATE, {
      ...NAVIGATION,
      previous: undefined,
    });
    expect(html).not.toContain('previous');
    expect(html).toContain('button next');
  });

  test('renders nothing without neighbors or outside every index', () => {
    for (const navigation of [
      { ...NAVIGATION, previous: undefined, next: undefined },
      undefined,
    ]) {
      expect(render(PAGINATION_TEMPLATE, navigation)).not.toContain('<nav');
    }
  });
});
