import { describe, expect, test } from 'bun:test';
import { getPdfPageNumber, getPdfBaseUrl, groupPdfResults } from './pdf-utils';
import type { Result } from './pdf-utils';

describe('getPdfPageNumber', () => {
  test('returns page number from meta string', () => {
    expect(getPdfPageNumber('/doc.pdf#page=3', '3')).toBe(3);
  });

  test('prefers meta over URL hash', () => {
    expect(getPdfPageNumber('/doc.pdf#page=5', '2')).toBe(2);
  });

  test('falls back to URL hash when meta is undefined', () => {
    expect(getPdfPageNumber('/doc.pdf#page=7', undefined)).toBe(7);
  });

  test('falls back to URL hash when meta is empty', () => {
    expect(getPdfPageNumber('/doc.pdf#page=4', '')).toBe(4);
  });

  test('falls back to URL hash when meta is not a number', () => {
    expect(getPdfPageNumber('/doc.pdf#page=4', 'abc')).toBe(4);
  });

  test('returns null when neither meta nor hash has a page', () => {
    expect(getPdfPageNumber('/doc.pdf', undefined)).toBeNull();
  });

  test('returns null for non-positive meta page number', () => {
    expect(getPdfPageNumber('/doc.pdf', '0')).toBeNull();
  });

  test('returns null for negative meta page number', () => {
    expect(getPdfPageNumber('/doc.pdf', '-1')).toBeNull();
  });

  test('returns null for hash page=0', () => {
    expect(getPdfPageNumber('/doc.pdf#page=0', undefined)).toBeNull();
  });

  test('parses page from hash with other params', () => {
    expect(getPdfPageNumber('/doc.pdf#zoom=100&page=12', undefined)).toBe(12);
  });

  test('handles case-insensitive page hash', () => {
    expect(getPdfPageNumber('/doc.pdf#Page=9', undefined)).toBe(9);
  });
});

describe('getPdfBaseUrl', () => {
  test('returns base URL for a PDF with hash', () => {
    expect(getPdfBaseUrl('/docs/guide.pdf#page=3')).toBe('/docs/guide.pdf');
  });

  test('returns URL unchanged when no hash present', () => {
    expect(getPdfBaseUrl('/docs/guide.pdf')).toBe('/docs/guide.pdf');
  });

  test('returns null for non-PDF URL', () => {
    expect(getPdfBaseUrl('/about/')).toBeNull();
  });

  test('returns null for non-PDF URL with hash', () => {
    expect(getPdfBaseUrl('/about/#section')).toBeNull();
  });

  test('handles .PDF extension case-insensitively', () => {
    expect(getPdfBaseUrl('/docs/GUIDE.PDF#page=1')).toBe('/docs/GUIDE.PDF');
  });
});

describe('groupPdfResults', () => {
  function makeResult(overrides: Partial<Result>): Result {
    return {
      title: 'doc.pdf',
      url: '/doc.pdf',
      excerpt: '',
      score: 1,
      subResults: [],
      pageNumber: null,
      ...overrides,
    };
  }

  test('passes through non-PDF results unchanged', () => {
    const results: Result[] = [
      makeResult({ title: 'About', url: '/about/', score: 5 }),
      makeResult({ title: 'Home', url: '/', score: 3 }),
    ];
    const grouped = groupPdfResults(results);
    expect(grouped).toEqual(results);
  });

  test('groups multiple PDF page results into one result with sub-results', () => {
    const results: Result[] = [
      makeResult({
        url: '/doc.pdf#page=3',
        score: 10,
        pageNumber: 3,
        excerpt: 'page 3 text',
      }),
      makeResult({
        url: '/doc.pdf#page=1',
        score: 5,
        pageNumber: 1,
        excerpt: 'page 1 text',
      }),
    ];
    const grouped = groupPdfResults(results);
    expect(grouped).toHaveLength(1);
    expect(grouped[0].url).toBe('/doc.pdf');
    expect(grouped[0].score).toBe(10);
    expect(grouped[0].subResults).toEqual([
      { title: 'Page 1', url: '/doc.pdf#page=1', excerpt: 'page 1 text' },
      { title: 'Page 3', url: '/doc.pdf#page=3', excerpt: 'page 3 text' },
    ]);
  });

  test('sub-results are sorted by page number', () => {
    const results: Result[] = [
      makeResult({ url: '/doc.pdf#page=5', score: 1, pageNumber: 5 }),
      makeResult({ url: '/doc.pdf#page=2', score: 8, pageNumber: 2 }),
      makeResult({ url: '/doc.pdf#page=9', score: 3, pageNumber: 9 }),
    ];
    const grouped = groupPdfResults(results);
    expect(grouped[0].subResults.map(s => s.title)).toEqual([
      'Page 2',
      'Page 5',
      'Page 9',
    ]);
  });

  test('primary result uses highest-scoring page', () => {
    const results: Result[] = [
      makeResult({
        url: '/doc.pdf#page=1',
        score: 2,
        pageNumber: 1,
        excerpt: 'low',
      }),
      makeResult({
        url: '/doc.pdf#page=4',
        score: 9,
        pageNumber: 4,
        excerpt: 'high',
      }),
    ];
    const grouped = groupPdfResults(results);
    expect(grouped[0].excerpt).toBe('high');
    expect(grouped[0].score).toBe(9);
  });

  test('mixes non-PDF and grouped PDF results sorted by score', () => {
    const results: Result[] = [
      makeResult({
        title: 'About',
        url: '/about/',
        score: 7,
        pageNumber: null,
      }),
      makeResult({ url: '/doc.pdf#page=1', score: 10, pageNumber: 1 }),
      makeResult({ url: '/doc.pdf#page=2', score: 3, pageNumber: 2 }),
    ];
    const grouped = groupPdfResults(results);
    expect(grouped).toHaveLength(2);
    expect(grouped[0].url).toBe('/doc.pdf');
    expect(grouped[0].score).toBe(10);
    expect(grouped[1].url).toBe('/about/');
    expect(grouped[1].score).toBe(7);
  });

  test('does not group PDF result without a page number', () => {
    const results: Result[] = [
      makeResult({ url: '/doc.pdf', score: 5, pageNumber: null }),
    ];
    const grouped = groupPdfResults(results);
    expect(grouped).toHaveLength(1);
    expect(grouped[0].url).toBe('/doc.pdf');
    expect(grouped[0].subResults).toEqual([]);
  });

  test('groups results from different PDFs separately', () => {
    const results: Result[] = [
      makeResult({
        title: 'a.pdf',
        url: '/a.pdf#page=1',
        score: 5,
        pageNumber: 1,
      }),
      makeResult({
        title: 'b.pdf',
        url: '/b.pdf#page=1',
        score: 8,
        pageNumber: 1,
      }),
    ];
    const grouped = groupPdfResults(results);
    expect(grouped).toHaveLength(2);
    const urls = grouped.map(r => r.url).sort();
    expect(urls).toEqual(['/a.pdf', '/b.pdf']);
  });
});
