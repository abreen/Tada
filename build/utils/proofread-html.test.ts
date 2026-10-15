import { describe, expect, test } from 'bun:test';
import { selectOne } from 'css-select';
import { getAttributeValue, textContent } from 'domutils';
import type { AnyNode, Element } from 'domhandler';
import { parse, serialize } from 'parse5';
import {
  adapter,
  type Htmlparser2TreeAdapterMap,
} from 'parse5-htmlparser2-tree-adapter';
import {
  PROOFREAD_HEAD,
  proofreadHtml,
  toLintConfig,
  toTextIssues,
  toUtf16Offsets,
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

function select(selector: string, html: string): Element {
  const document = parse<Htmlparser2TreeAdapterMap>(html, {
    treeAdapter: adapter,
  });
  return selectOne<AnyNode, Element>(selector, document)!;
}

function mainOf(html: string): string {
  return serialize<Htmlparser2TreeAdapterMap>(select('main', html), {
    treeAdapter: adapter,
  });
}

/** The HTML as the parser serializes it, so tests ignore attribute order */
function serialized(content: string): string {
  return mainOf(page(content));
}

describe('proofreadHtml', () => {
  test('underlines spelling and grammar problems in main content', async () => {
    const { check } = fakeCheck({ spelling: /teh/, grammar: /I has/ });
    const html = await proofreadHtml(page('<p>I has teh cat.</p>'), check);
    expect(mainOf(html)).toBe(
      serialized(
        '<p><span class="proofread-grammar">I has</span> <span class="proofread-spelling">teh</span> cat.</p>',
      ),
    );
  });

  test('adds the message as a title and as escaped HTML for the tooltip', async () => {
    const check: CheckText = async () => [
      {
        start: 4,
        end: 7,
        kind: 'spelling',
        message: 'Did you mean to spell `teh` this way?',
        messageHtml: '<p>Did you mean <code>"the"</code>?</p>\n',
      },
    ];
    const html = await proofreadHtml(page('<p>Use teh cat.</p>'), check);
    const span = select('main span', html);
    expect(getAttributeValue(span, 'class')).toBe('proofread-spelling');
    expect(textContent(span)).toBe('teh');
    expect(getAttributeValue(span, 'title')).toBe(
      'Did you mean to spell \u201cteh\u201d this way?',
    );
    expect(getAttributeValue(span, 'data-proofread-message')).toBe(
      '<p>Did you mean <code>"the"</code>?</p>',
    );
  });

  test('adds the underline style to the head', async () => {
    const { check } = fakeCheck({});
    const html = await proofreadHtml(page('<p>Fine.</p>'), check);
    expect(textContent(select('head style', html))).toBe(PROOFREAD_HEAD.css);
    expect(textContent(select('head script', html))).toBe(PROOFREAD_HEAD.js);
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

  test('keeps images and word breaks inside the sentence', async () => {
    const { check, texts } = fakeCheck({});
    await proofreadHtml(
      page('<p>Click <img src="i.png" alt=""> to save a long<wbr>word.</p>'),
      check,
    );
    expect(texts).toEqual(['Click  to save a longword.']);
  });

  test('separates text on either side of a nested block', async () => {
    const { check, texts } = fakeCheck({});
    await proofreadHtml(
      page('<div>See the figure<p>Caption</p>below</div>'),
      check,
    );
    expect(texts).toEqual(['See the figure\nbelow', 'Caption']);
  });

  test('separates text on either side of a skipped element', async () => {
    const { check, texts } = fakeCheck({});
    await proofreadHtml(page('<p>word<button>Go</button>s</p>'), check);
    expect(texts).toEqual(['word\ns']);
  });

  test('splits an underline across inline elements', async () => {
    const { check } = fakeCheck({ grammar: /an big/ });
    const html = await proofreadHtml(
      page('<p>It is an <strong>big</strong> deal.</p>'),
      check,
    );
    expect(mainOf(html)).toBe(
      serialized(
        '<p>It is <span class="proofread-grammar">an </span><strong><span class="proofread-grammar">big</span></strong> deal.</p>',
      ),
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
      serialized(
        '<p>Call a <code>fooBar</code> on <span class="proofread-spelling">teh</span> list.</p>',
      ),
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
    expect(mainOf(html)).toBe(serialized(content));
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
      serialized(
        '<p>Tom &amp; I <span class="proofread-spelling">dont&#39;t</span> go.</p>',
      ),
    );
  });

  test('ignores problems with whitespace only', async () => {
    const { check } = fakeCheck({ grammar: / {2,}/ });
    const html = await proofreadHtml(page('<p>Two    spaces.</p>'), check);
    expect(mainOf(html)).toBe(serialized('<p>Two    spaces.</p>'));
  });

  test('treats a line break as whitespace in the sentence', async () => {
    const { check, texts } = fakeCheck({});
    await proofreadHtml(page('<p>One<br>two</p>'), check);
    expect(texts).toEqual(['One\ntwo']);
  });

  test('leaves the content unchanged when nothing is found', async () => {
    const { check } = fakeCheck({});
    const content = '<p>All <a href="/x">good</a> here.</p>';
    const html = await proofreadHtml(page(content), check);
    expect(mainOf(html)).toBe(serialized(content));
    expect(html).toContain('<p>Teh header</p>');
  });

  test('keeps escaped markup in the title and textarea escaped', async () => {
    const { check } = fakeCheck({});
    const html = await proofreadHtml(
      '<html><head><title>The &lt;/title&gt; element</title></head><body><main><p>Hi.</p><textarea>&lt;/textarea&gt;</textarea></main></body></html>',
      check,
    );
    expect(html).toContain('<title>The &lt;/title&gt; element</title>');
    expect(html).toContain('<textarea>&lt;/textarea&gt;</textarea>');
  });

  test('returns a page without main unchanged', async () => {
    const { check, texts } = fakeCheck({});
    const html = '<html><body><p>Teh</p></body></html>';
    expect(await proofreadHtml(html, check)).toBe(html);
    expect(texts).toEqual([]);
  });
});

describe('toUtf16Offsets', () => {
  test('keeps offsets in text without astral characters', () => {
    const toUtf16 = toUtf16Offsets('Naïve café');
    expect(toUtf16(6)).toBe(6);
  });

  test('counts astral characters as two UTF-16 code units', () => {
    const text = '😀 😀 recieve';
    const toUtf16 = toUtf16Offsets(text);
    expect(text.slice(toUtf16(4), toUtf16(11))).toBe('recieve');
  });
});

describe('toTextIssues', () => {
  test('marks spelling and typo lints as spelling and others as grammar', () => {
    expect(
      toTextIssues('teh cat an dog', [
        { start: 0, end: 3, kind: 'Typo', message: 'm1', messageHtml: 'h1' },
        {
          start: 8,
          end: 10,
          kind: 'Miscellaneous',
          message: 'm2',
          messageHtml: 'h2',
        },
      ]),
    ).toEqual([
      { start: 0, end: 3, kind: 'spelling', message: 'm1', messageHtml: 'h1' },
      { start: 8, end: 10, kind: 'grammar', message: 'm2', messageHtml: 'h2' },
    ]);
  });
});

describe('toLintConfig', () => {
  const defaults = { SpellCheck: true, LongSentences: true, Dashes: false };

  test('overrides only the configured rules', () => {
    expect(
      toLintConfig(defaults, { LongSentences: false, Dashes: true }),
    ).toEqual({
      config: { SpellCheck: true, LongSentences: false, Dashes: true },
      unknown: [],
    });
  });

  test('keeps the defaults when no rules are configured', () => {
    expect(toLintConfig(defaults, {})).toEqual({
      config: defaults,
      unknown: [],
    });
  });

  test('skips and reports rules Harper does not have', () => {
    expect(toLintConfig(defaults, { Bogus: false, SpellCheck: false })).toEqual(
      {
        config: { SpellCheck: false, LongSentences: true, Dashes: false },
        unknown: ['Bogus'],
      },
    );
  });
});
