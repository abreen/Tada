import { describe, expect, test } from 'bun:test';
import { buildPdfPageRecords } from './pdf-text';

describe('buildPdfPageRecords', () => {
  test('creates page records with 1-based page numbers', () => {
    const result = buildPdfPageRecords(['Hello world', 'Second page']);
    expect(result).toEqual({
      pages: [
        { pageNumber: 1, content: 'Hello world' },
        { pageNumber: 2, content: 'Second page' },
      ],
      hasExtractedText: true,
    });
  });

  test('normalizes whitespace in extracted text', () => {
    const result = buildPdfPageRecords(['  lots   of\n\tspaces  ']);
    expect(result).toEqual({
      pages: [{ pageNumber: 1, content: 'lots of spaces' }],
      hasExtractedText: true,
    });
  });

  test('skips blank pages', () => {
    const result = buildPdfPageRecords(['Page one', '', '   ', 'Page four']);
    expect(result).toEqual({
      pages: [
        { pageNumber: 1, content: 'Page one' },
        { pageNumber: 4, content: 'Page four' },
      ],
      hasExtractedText: true,
    });
  });

  test('returns hasExtractedText false when all pages are blank', () => {
    const result = buildPdfPageRecords(['', '   ', '\n\t']);
    expect(result).toEqual({ pages: [], hasExtractedText: false });
  });

  test('returns hasExtractedText false for empty input', () => {
    const result = buildPdfPageRecords([]);
    expect(result).toEqual({ pages: [], hasExtractedText: false });
  });

  test('handles a single page', () => {
    const result = buildPdfPageRecords(['Only page']);
    expect(result).toEqual({
      pages: [{ pageNumber: 1, content: 'Only page' }],
      hasExtractedText: true,
    });
  });
});
