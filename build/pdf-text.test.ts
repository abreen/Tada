import { describe, expect, test } from 'bun:test';
import { buildPdfPageRecords, createCachedPdfExtractor } from './pdf-text';

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

describe('createCachedPdfExtractor', () => {
  const result = {
    pages: [{ pageNumber: 1, content: 'Page text' }],
    hasExtractedText: true,
  };

  function setup() {
    const signatures = new Map([['/a.pdf', { size: 10, mtimeMs: 1 }]]);
    const calls: string[] = [];
    let fail = false;
    const extract = createCachedPdfExtractor(
      async pdfPath => {
        calls.push(pdfPath);
        if (fail) {
          throw new Error('mutool failed');
        }
        return result;
      },
      pdfPath => signatures.get(pdfPath)!,
    );
    return {
      extract,
      calls,
      signatures,
      setFail(value: boolean) {
        fail = value;
      },
    };
  }

  test('reuses extracted text while the file is unchanged', async () => {
    const { extract, calls } = setup();
    expect(await extract('/a.pdf')).toBe(result);
    expect(await extract('/a.pdf')).toBe(result);
    expect(calls).toEqual(['/a.pdf']);
  });

  test('extracts again after the size or modification time changes', async () => {
    const { extract, calls, signatures } = setup();
    await extract('/a.pdf');
    signatures.set('/a.pdf', { size: 10, mtimeMs: 2 });
    await extract('/a.pdf');
    signatures.set('/a.pdf', { size: 11, mtimeMs: 2 });
    await extract('/a.pdf');
    expect(calls).toEqual(['/a.pdf', '/a.pdf', '/a.pdf']);
  });

  test('shares one extraction between concurrent requests', async () => {
    const { extract, calls } = setup();
    await Promise.all([extract('/a.pdf'), extract('/a.pdf')]);
    expect(calls).toEqual(['/a.pdf']);
  });

  test('does not cache failed extractions', async () => {
    const { extract, calls, setFail } = setup();
    setFail(true);
    await expect(extract('/a.pdf')).rejects.toThrow('mutool failed');
    setFail(false);
    expect(await extract('/a.pdf')).toBe(result);
    expect(calls).toEqual(['/a.pdf', '/a.pdf']);
  });
});
