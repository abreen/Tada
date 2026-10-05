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

  test('falls back to legacy named anchors', () => {
    const document = documentFor(
      '<div name="legacy">Not an anchor</div><a name="legacy">Anchor</a>',
    );

    expect(getHashTarget(document, '#legacy')?.textContent).toBe('Anchor');
  });

  test('prefers IDs over named anchors', () => {
    const document = documentFor(
      '<a name="section">Anchor</a><h2 id="section">Heading</h2>',
    );

    expect(getHashTarget(document, '#section')?.textContent).toBe('Heading');
  });

  test('finds decoded named anchors', () => {
    const document = documentFor('<a name="hello world">Anchor</a>');

    expect(getHashTarget(document, '#hello%20world')?.textContent).toBe(
      'Anchor',
    );
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
