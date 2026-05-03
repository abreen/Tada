import { describe, expect, test } from 'bun:test';
import fs from 'fs';
import path from 'path';
import _ from 'lodash';
import { encodeAuthoredUrl } from '../build/template-globals';

function readTemplateForTest(fileName: string): string {
  return fs.readFileSync(path.join(import.meta.dir, fileName), 'utf-8');
}

const AUTHOR_TEMPLATE = readTemplateForTest('_author.html');

function renderAuthor(params: Record<string, unknown>): string {
  return _.template(AUTHOR_TEMPLATE)({ ...params, encodeAuthoredUrl });
}

describe('_author.html template', () => {
  test('encodes authored author URLs before rendering href and src attributes', () => {
    const html = renderAuthor({
      page: {
        author: {
          name: 'Jane Doe',
          url: 'https://example.com/people/Jane Doe.html?label=<Jane>"',
          avatar: '/avatars/jane.png',
        },
      },
    });

    expect(html).toContain(
      'href="https://example.com/people/Jane%20Doe.html?label=%3CJane%3E%22"',
    );
    expect(html).toContain('src="/avatars/jane.png"');
  });

  test('preserves existing percent escapes in authored author URLs', () => {
    const html = renderAuthor({
      page: {
        author: {
          name: 'Jane Doe',
          url: 'https://example.com/people/Jane%20Doe.html',
          avatar: '/avatars/jane.png',
        },
      },
    });

    expect(html).toContain('href="https://example.com/people/Jane%20Doe.html"');
    expect(html).not.toContain('Jane%2520Doe');
  });

  test('preserves existing percent escapes for reserved URL characters', () => {
    const html = renderAuthor({
      page: {
        author: {
          name: 'Jane Doe',
          url: 'https://example.com/people/Jane%2FDoe.html',
          avatar: '/avatars/jane.png',
        },
      },
    });

    expect(html).toContain('href="https://example.com/people/Jane%2FDoe.html"');
    expect(html).not.toContain('Jane%252FDoe');
  });
});
