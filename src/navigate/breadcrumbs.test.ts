import { describe, expect, test } from 'bun:test';
import { breadcrumbPageKey, sharedBreadcrumbCount } from './breadcrumbs';

const labs = {
  label: 'Labs',
  url: 'https://example.com/course/labs/index.html',
};
const lab0 = {
  label: 'Lab 0',
  url: 'https://example.com/course/labs/00/index.html',
};
const vowel = {
  label: 'Counting vowels',
  url: 'https://example.com/course/labs/00/VowelCounter.java.html',
};

describe('breadcrumb transition identity', () => {
  test('keeps the shared prefix when ascending or descending', () => {
    expect(sharedBreadcrumbCount([labs, lab0, vowel], [labs, lab0])).toBe(2);
    expect(sharedBreadcrumbCount([labs, lab0], [labs, lab0, vowel])).toBe(2);
  });

  test('keeps common ancestors across sibling pages', () => {
    expect(
      sharedBreadcrumbCount(
        [labs, lab0, vowel],
        [labs, lab0, { label: 'Other', url: '/other.html' }],
      ),
    ).toBe(2);
  });

  test('requires both the destination and displayed label to match', () => {
    expect(
      sharedBreadcrumbCount(
        [labs, lab0],
        [labs, { ...lab0, label: 'Introduction' }],
      ),
    ).toBe(1);
    expect(
      sharedBreadcrumbCount(
        [labs, lab0],
        [labs, { ...lab0, url: '/other.html' }],
      ),
    ).toBe(1);
  });

  test('does not preserve coincidental matches after different ancestors', () => {
    expect(
      sharedBreadcrumbCount(
        [labs, lab0],
        [{ label: 'Other', url: '/other.html' }, lab0],
      ),
    ).toBe(0);
  });

  test('handles absent trails and identical trails', () => {
    expect(sharedBreadcrumbCount([], [labs])).toBe(0);
    expect(sharedBreadcrumbCount([labs], [])).toBe(0);
    expect(sharedBreadcrumbCount([labs, lab0], [labs, lab0])).toBe(2);
  });

  test('resolves relative links against each page with a non-root base path', () => {
    const source = 'https://example.com/course/labs/00/page.html';
    expect(breadcrumbPageKey('../index.html#intro', source)).toBe(labs.url);
    expect(breadcrumbPageKey('/course/labs/00/index.html', source)).toBe(
      lab0.url,
    );
    expect(breadcrumbPageKey(source, source)).toBe(source);
  });

  test('preserves query identity while ignoring fragments and normalizing spaces', () => {
    const source = 'https://example.com/course/index.html';
    expect(breadcrumbPageKey('./my notes.html?q=full#intro', source)).toBe(
      breadcrumbPageKey('/course/my%20notes.html?q=full#other', source),
    );
    expect(breadcrumbPageKey('./index.html?q=full', source)).not.toBe(
      breadcrumbPageKey('./index.html?q=brief', source),
    );
  });
});
