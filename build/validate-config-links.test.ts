import { describe, expect, test } from 'bun:test';
import {
  validateNavLinks,
  validateAuthorLinks,
  validateConfigLinks,
  validateParentLink,
} from './validate-config-links';

describe('validateNavLinks', () => {
  test('passes for valid internal links', () => {
    const validTargets = new Set(['/lectures/index.html', '/labs/index.html']);
    const navData = [
      {
        title: 'Topics',
        links: [
          { text: 'Lectures', internal: '/lectures/index.html' },
          { text: 'Labs', internal: '/labs/index.html' },
        ],
      },
    ];
    expect(validateNavLinks(navData, validTargets)).toEqual([]);
  });

  test('reports broken internal links', () => {
    const validTargets = new Set(['/about.html']);
    const navData = [
      {
        title: 'Menu',
        links: [{ text: 'Missing', internal: '/missing.html' }],
      },
    ];
    const errors = validateNavLinks(navData, validTargets);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('/missing.html');
    expect(errors[0]).toContain('nav.yaml');
  });

  test('reports multiple broken links', () => {
    const validTargets = new Set<string>();
    const navData = [
      {
        title: 'Menu',
        links: [
          { text: 'A', internal: '/a.html' },
          { text: 'B', internal: '/b.html' },
        ],
      },
    ];
    const errors = validateNavLinks(navData, validTargets);
    expect(errors).toHaveLength(2);
  });

  test('skips disabled links', () => {
    const validTargets = new Set<string>();
    const navData = [
      {
        title: 'Menu',
        links: [
          { text: 'Coming Soon', internal: '/coming.html', disabled: true },
        ],
      },
    ];
    expect(validateNavLinks(navData, validTargets)).toEqual([]);
  });

  test('skips external links', () => {
    const validTargets = new Set<string>();
    const navData = [
      {
        title: 'External',
        links: [{ text: 'Google', external: 'https://google.com' }],
      },
    ];
    expect(validateNavLinks(navData, validTargets)).toEqual([]);
  });

  test('normalizes paths before checking', () => {
    const validTargets = new Set(['/docs/guide.html']);
    const navData = [
      {
        title: 'Menu',
        links: [{ text: 'Guide', internal: '/docs/../docs/guide.html' }],
      },
    ];
    expect(validateNavLinks(navData, validTargets)).toEqual([]);
  });

  test('rejects relative internal links', () => {
    const validTargets = new Set(['/about.html']);
    const navData = [
      { title: 'Menu', links: [{ text: 'About', internal: 'about.html' }] },
    ];
    const errors = validateNavLinks(navData, validTargets);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('about.html');
    expect(errors[0]).toContain('must start with "/"');
  });

  test('returns empty array for empty nav data', () => {
    expect(validateNavLinks([], new Set())).toEqual([]);
  });

  test('returns empty array for null/undefined nav data', () => {
    expect(validateNavLinks(null, new Set())).toEqual([]);
    expect(validateNavLinks(undefined, new Set())).toEqual([]);
  });
});

describe('validateAuthorLinks', () => {
  test('passes for valid author url and avatar', () => {
    const validTargets = new Set(['/about/alex.html', '/avatars/alex.jpg']);
    const authorsData = {
      alex: {
        name: 'Alex',
        avatar: '/avatars/alex.jpg',
        url: '/about/alex.html',
      },
    };
    expect(validateAuthorLinks(authorsData, validTargets)).toEqual([]);
  });

  test('reports broken author url', () => {
    const validTargets = new Set(['/avatars/alex.jpg']);
    const authorsData = {
      alex: { name: 'Alex', avatar: '/avatars/alex.jpg', url: '/missing.html' },
    };
    const errors = validateAuthorLinks(authorsData, validTargets);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('/missing.html');
    expect(errors[0]).toContain('authors.yaml');
    expect(errors[0]).toContain('alex');
  });

  test('passes for valid absolute author url', () => {
    const validTargets = new Set(['/avatars/alex.jpg']);
    const authorsData = {
      alex: {
        name: 'Alex',
        avatar: '/avatars/alex.jpg',
        url: 'https://example.com/people/Alex Doe.html?q=hello%20world',
      },
    };
    expect(validateAuthorLinks(authorsData, validTargets)).toEqual([]);
  });

  test('passes for valid non-http absolute author url', () => {
    const validTargets = new Set(['/avatars/alex.jpg']);
    const authorsData = {
      alex: {
        name: 'Alex',
        avatar: '/avatars/alex.jpg',
        url: 'mailto:alex@example.com',
      },
    };
    expect(validateAuthorLinks(authorsData, validTargets)).toEqual([]);
  });

  test('rejects absolute author url with leading or trailing whitespace', () => {
    const validTargets = new Set(['/avatars/alex.jpg']);
    const authorsData = {
      alex: {
        name: 'Alex',
        avatar: '/avatars/alex.jpg',
        url: ' https://example.com',
      },
      bob: {
        name: 'Bob',
        avatar: '/avatars/alex.jpg',
        url: 'https://example.com ',
      },
    };
    const errors = validateAuthorLinks(authorsData, validTargets);
    expect(errors).toHaveLength(2);
    expect(errors[0]).toContain(' https://example.com');
    expect(errors[1]).toContain('https://example.com ');
  });

  test('rejects special-scheme author urls without slashes', () => {
    const validTargets = new Set(['/avatars/alex.jpg']);
    const authorsData = {
      alex: {
        name: 'Alex',
        avatar: '/avatars/alex.jpg',
        url: 'https:example.com',
      },
    };
    const errors = validateAuthorLinks(authorsData, validTargets);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('https:example.com');
  });

  test('passes for valid internal author url with query and fragment', () => {
    const validTargets = new Set(['/about/alex.html', '/avatars/alex.jpg']);
    const authorsData = {
      alex: {
        name: 'Alex',
        avatar: '/avatars/alex.jpg',
        url: '/about/alex.html?tab=profile#bio',
      },
    };
    expect(validateAuthorLinks(authorsData, validTargets)).toEqual([]);
  });

  test('reports broken avatar path', () => {
    const validTargets = new Set<string>();
    const authorsData = {
      alex: { name: 'Alex', avatar: '/avatars/missing.jpg' },
    };
    const errors = validateAuthorLinks(authorsData, validTargets);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('/avatars/missing.jpg');
    expect(errors[0]).toContain('avatar');
  });

  test('reports both broken url and avatar', () => {
    const validTargets = new Set<string>();
    const authorsData = {
      alex: {
        name: 'Alex',
        avatar: '/avatars/missing.jpg',
        url: '/missing.html',
      },
    };
    const errors = validateAuthorLinks(authorsData, validTargets);
    expect(errors).toHaveLength(2);
  });

  test('skips author without url field', () => {
    const validTargets = new Set(['/avatars/alex.jpg']);
    const authorsData = { alex: { name: 'Alex', avatar: '/avatars/alex.jpg' } };
    expect(validateAuthorLinks(authorsData, validTargets)).toEqual([]);
  });

  test('returns empty array for null/undefined authors data', () => {
    expect(validateAuthorLinks(null, new Set())).toEqual([]);
    expect(validateAuthorLinks(undefined, new Set())).toEqual([]);
  });

  test('validates multiple authors independently', () => {
    const validTargets = new Set(['/avatars/alex.jpg']);
    const authorsData = {
      alex: { name: 'Alex', avatar: '/avatars/alex.jpg' },
      bob: { name: 'Bob', avatar: '/avatars/bob.jpg' },
    };
    const errors = validateAuthorLinks(authorsData, validTargets);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('bob');
  });

  test('rejects relative author avatar and url paths', () => {
    const validTargets = new Set(['/about/alex.html', '/avatars/alex.jpg']);
    const authorsData = {
      alex: {
        name: 'Alex',
        avatar: 'avatars/alex.jpg',
        url: 'about/alex.html',
      },
    };
    const errors = validateAuthorLinks(authorsData, validTargets);
    expect(errors).toHaveLength(2);
    expect(errors[0]).toContain('must start with "/"');
    expect(errors[1]).toContain('must start with "/"');
  });

  test('rejects invalid author url', () => {
    const validTargets = new Set(['/avatars/alex.jpg']);
    const authorsData = {
      alex: { name: 'Alex', avatar: '/avatars/alex.jpg', url: 'not-a-url' },
    };
    const errors = validateAuthorLinks(authorsData, validTargets);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('not-a-url');
  });
});

describe('validateConfigLinks', () => {
  test('combines nav and author errors', () => {
    const validTargets = new Set(['/avatars/alex.jpg']);
    const navData = [
      {
        title: 'Menu',
        links: [{ text: 'Missing', internal: '/missing.html' }],
      },
    ];
    const authorsData = {
      alex: {
        name: 'Alex',
        avatar: '/avatars/alex.jpg',
        url: '/also-missing.html',
      },
    };
    const errors = validateConfigLinks(validTargets, navData, authorsData);
    expect(errors).toHaveLength(2);
  });

  test('returns empty array when everything is valid', () => {
    const validTargets = new Set(['/about.html', '/avatars/a.jpg']);
    const navData = [
      { title: 'Menu', links: [{ text: 'About', internal: '/about.html' }] },
    ];
    const authorsData = { a: { name: 'A', avatar: '/avatars/a.jpg' } };
    expect(validateConfigLinks(validTargets, navData, authorsData)).toEqual([]);
  });

  test('handles missing authors config gracefully', () => {
    const validTargets = new Set(['/about.html']);
    const navData = [
      { title: 'Menu', links: [{ text: 'About', internal: '/about.html' }] },
    ];
    expect(validateConfigLinks(validTargets, navData, undefined)).toEqual([]);
  });
});

describe('validateParentLink', () => {
  test('returns null for valid parent link', () => {
    const validTargets = new Set(['/lectures/index.html']);
    expect(
      validateParentLink(
        '/lectures/index.html',
        'test.md',
        validTargets,
        '/notes/index.html',
      ),
    ).toBeNull();
  });

  test('resolves relative parent links from the declaring page', () => {
    const validTargets = new Set(['/docs/index.html']);
    expect(
      validateParentLink(
        '../index.html',
        'content/docs/topic/page.md',
        validTargets,
        '/docs/topic/page.html',
      ),
    ).toBeNull();
  });

  test('ignores query strings and fragments when validating parent links', () => {
    const validTargets = new Set(['/docs/index.html']);
    expect(
      validateParentLink(
        '../index.html?view=full#overview',
        'content/docs/topic/page.md',
        validTargets,
        '/docs/topic/page.html',
      ),
    ).toBeNull();
  });

  test('rejects parent links without a pathname', () => {
    const validTargets = new Set(['/docs/topic', '/docs/topic/index.html']);
    const error = validateParentLink(
      '?view=full#overview',
      'content/docs/topic/index.md',
      validTargets,
      '/docs/topic/index.html',
    );
    expect(error).not.toBeNull();
    expect(error).toContain('?view=full#overview');
    expect(error).toContain('content/docs/topic/index.md');
  });

  test('returns error for broken parent link', () => {
    const validTargets = new Set<string>();
    const error = validateParentLink(
      '/missing/index.html',
      'content/page.md',
      validTargets,
      '/index.html',
    );
    expect(error).not.toBeNull();
    expect(error).toContain('/missing/index.html');
    expect(error).toContain('content/page.md');
    expect(error).toContain('parent');
  });

  test('returns null when parent is undefined', () => {
    expect(
      validateParentLink(undefined, 'test.md', new Set(), '/index.html'),
    ).toBeNull();
  });

  test('normalizes parent path before checking', () => {
    const validTargets = new Set(['/docs/index.html']);
    expect(
      validateParentLink(
        '/docs/../docs/index.html',
        'test.md',
        validTargets,
        '/index.html',
      ),
    ).toBeNull();
  });

  test('normalizes relative parent paths before checking', () => {
    const validTargets = new Set(['/docs/index.html']);
    expect(
      validateParentLink(
        '../guides/../index.html',
        'content/docs/topic/page.md',
        validTargets,
        '/docs/topic/page.html',
      ),
    ).toBeNull();
  });
});
