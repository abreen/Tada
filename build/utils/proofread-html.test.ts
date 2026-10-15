import { describe, expect, test } from 'bun:test';
import {
  PROOFREAD_STYLE,
  proofreadHtml,
  type CheckText,
  type IssueKind,
} from './proofread-html';

/** Flags every match of each pattern, and records the text it was given */
function fakeCheck(patterns: Partial<Record<IssueKind, RegExp>>): {
  check: CheckText;
  texts: string[];
} {
  const texts: string[] = [];
  return {
    texts,
    async check(text) {
      texts.push(text);
      return Object.entries(patterns).flatMap(([kind, pattern]) =>
        Array.from(text.matchAll(new RegExp(pattern, 'g')), match => ({
          start: match.index,
          end: match.index + match[0].length,
          kind: kind as IssueKind,
        })),
      );
    },
  };
}

function page(content: string): string {
  return `<html><head><title>T</title></head><body><header><p>Teh header</p></header><main class="body">${content}</main></body></html>`;
}

function mainOf(html: string): string {
  return html.match(/<main class="body">([\s\S]*)<\/main>/)![1];
}

describe('proofreadHtml', () => {
  test('underlines spelling and grammar problems in main content', async () => {
    const { check } = fakeCheck({ spelling: /teh/, grammar: /I has/ });
    const html = await proofreadHtml(page('<p>I has teh cat.</p>'), check);
    expect(mainOf(html)).toBe(
      '<p><span class="proofread-grammar">I has</span> <span class="proofread-spelling">teh</span> cat.</p>',
    );
  });

  test('adds the underline style to the head', async () => {
    const { check } = fakeCheck({});
    const html = await proofreadHtml(page('<p>Fine.</p>'), check);
    expect(html).toContain(`${PROOFREAD_STYLE}</head>`);
  });

  test('checks only text inside main', async () => {
    const { check, texts } = fakeCheck({ spelling: /Teh/ });
    const html = await proofreadHtml(page('<p>Body.</p>'), check);
    expect(texts).toEqual(['Body.']);
    expect(html).toContain('<p>Teh header</p>');
  });

  test('checks each block separately', async () => {
    const { check, texts } = fakeCheck({});
    await proofreadHtml(
      page('<h2>Title</h2><p>One <em>two</em>.</p><ul><li>Three</li></ul>'),
      check,
    );
    expect(texts).toEqual(['Title', 'One two.', 'Three']);
  });

  test('splits an underline across inline elements', async () => {
    const { check } = fakeCheck({ grammar: /an big/ });
    const html = await proofreadHtml(
      page('<p>It is an <strong>big</strong> deal.</p>'),
      check,
    );
    expect(mainOf(html)).toBe(
      '<p>It is <span class="proofread-grammar">an </span><strong><span class="proofread-grammar">big</span></strong> deal.</p>',
    );
  });

  test('keeps code in the sentence but drops problems that touch it', async () => {
    const { check, texts } = fakeCheck({
      spelling: /fooBar|teh/,
      grammar: /a fooBar/,
    });
    const html = await proofreadHtml(
      page('<p>Call a <code>fooBar</code> on teh list.</p>'),
      check,
    );
    expect(texts).toEqual(['Call a fooBar on teh list.']);
    expect(mainOf(html)).toBe(
      '<p>Call a <code>fooBar</code> on <span class="proofread-spelling">teh</span> list.</p>',
    );
  });

  test.each([
    ['<pre><code>teh</code></pre>'],
    ['<script>teh</script>'],
    ['<nav>teh</nav>'],
    ['<button>teh</button>'],
    ['<div aria-hidden="true">teh</div>'],
    ['<div hidden>teh</div>'],
    ['<div inert>teh</div>'],
    ['<p spellcheck="false">teh</p>'],
    ['<div data-pagefind-ignore>teh</div>'],
    ['<p class="question-q"><span class="question-label">teh</span></p>'],
  ])('ignores %s', async content => {
    const { check, texts } = fakeCheck({ spelling: /teh/ });
    const html = await proofreadHtml(page(content), check);
    expect(texts).toEqual([]);
    expect(mainOf(html)).toBe(content);
  });

  test('checks answers that are hidden from search', async () => {
    const { check } = fakeCheck({ spelling: /teh/ });
    const html = await proofreadHtml(
      page(
        '<div class="question-a-body" data-pagefind-ignore><p>teh</p></div>',
      ),
      check,
    );
    expect(mainOf(html)).toContain(
      '<p><span class="proofread-spelling">teh</span></p>',
    );
  });

  test('reads only the TeX source of KaTeX math', async () => {
    const { check, texts } = fakeCheck({});
    await proofreadHtml(
      page(
        '<p>Let <span class="katex"><span class="katex-mathml"><math><semantics><mrow><mi>x</mi></mrow><annotation encoding="application/x-tex">x</annotation></semantics></math></span><span class="katex-html" aria-hidden="true"><span class="mord">x</span></span></span> be odd.</p>',
      ),
      check,
    );
    expect(texts).toEqual(['Let x be odd.']);
  });

  test('decodes entities for checking and keeps them in the output', async () => {
    const { check, texts } = fakeCheck({ spelling: /dont't/ });
    const html = await proofreadHtml(
      page('<p>Tom &amp; I dont&#39;t go.</p>'),
      check,
    );
    expect(texts).toEqual(["Tom & I dont't go."]);
    expect(mainOf(html)).toBe(
      '<p>Tom &amp; I <span class="proofread-spelling">dont&#39;t</span> go.</p>',
    );
  });

  test('ignores problems with whitespace only', async () => {
    const { check } = fakeCheck({ grammar: / {2,}/ });
    const html = await proofreadHtml(page('<p>Two    spaces.</p>'), check);
    expect(mainOf(html)).toBe('<p>Two    spaces.</p>');
  });

  test('treats a line break as whitespace in the sentence', async () => {
    const { check, texts } = fakeCheck({});
    await proofreadHtml(page('<p>One<br>two</p>'), check);
    expect(texts).toEqual(['One\ntwo']);
  });

  test('leaves the page unchanged apart from the style when nothing is found', async () => {
    const { check } = fakeCheck({});
    const content = '<p>All <a href="/x">good</a> here.</p>';
    const html = await proofreadHtml(page(content), check);
    expect(html).toBe(
      page(content).replace('</head>', `${PROOFREAD_STYLE}</head>`),
    );
  });
});
