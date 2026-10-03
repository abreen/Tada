import { describe, expect, test } from 'bun:test';
import { htmlToPlainText } from './plain-text';

describe('htmlToPlainText', () => {
  test('keeps text around escaped markup characters', () => {
    expect(
      htmlToPlainText('Uses <code>a &lt; b</code> and 6&quot; rulers'),
    ).toBe('Uses a < b and 6" rulers');
  });

  test('removes inline HTML tags but keeps their text', () => {
    expect(htmlToPlainText('Width is 5&quot; <b>bold</b> &amp; more')).toBe(
      'Width is 5" bold & more',
    );
  });

  test('decodes entities exactly once', () => {
    expect(htmlToPlainText('&amp;lt;b&amp;gt; &amp;amp;')).toBe(
      '&lt;b&gt; &amp;',
    );
  });

  test('decodes named and numeric character references', () => {
    expect(htmlToPlainText('&copy; &#39;x&#x27; &nbsp;&mdash;')).toBe(
      "© 'x'  —",
    );
  });

  test('removes tags whose quoted attributes contain angle brackets', () => {
    expect(htmlToPlainText('<span title="a > b" data-x=\'<\'>x</span>y')).toBe(
      'xy',
    );
  });

  test('removes comments and self-closing tags', () => {
    expect(htmlToPlainText('a<!-- note -->b<br />c')).toBe('abc');
  });

  test('returns plain text unchanged', () => {
    expect(htmlToPlainText('Lecture 1: Intro')).toBe('Lecture 1: Intro');
  });
});
