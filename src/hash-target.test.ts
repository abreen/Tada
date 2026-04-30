import { describe, expect, test } from 'bun:test';
import { JSDOM } from 'jsdom';
import { getHashTarget } from './hash-target';

function documentFor(html: string): Document {
  return new JSDOM(`<body>${html}</body>`).window.document;
}

describe('getHashTarget', () => {
  test('finds raw percent-encoded generated heading IDs first', () => {
    const document = documentFor(
      '<h2 id="caf%C3%A9">Generated heading</h2><h2 id="café">Decoded heading</h2>',
    );

    expect(getHashTarget(document, '#caf%C3%A9')?.textContent).toBe(
      'Generated heading',
    );
  });

  test('falls back to decoded IDs for manually-authored HTML targets', () => {
    const document = documentFor('<h2 id="hello world">Hello World</h2>');

    expect(getHashTarget(document, '#hello%20world')?.id).toBe('hello world');
  });

  test('returns null for empty hash', () => {
    const document = documentFor('<h2 id="section">Section</h2>');

    expect(getHashTarget(document, '#')).toBeNull();
  });

  test('returns null for invalid percent escapes with no raw match', () => {
    const document = documentFor('<h2 id="section">Section</h2>');

    expect(getHashTarget(document, '#bad%zz')).toBeNull();
  });
});
