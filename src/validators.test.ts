import { describe, expect, test } from 'bun:test';
import {
  EMPTY_RESPONSE_VALIDATORS,
  getPreferredValidatorKey,
  getResponseValidators,
  hasResponseValidatorsChanged,
  hasUsableResponseValidators,
} from './validators';

describe('validators', () => {
  test('reads ETag and Last-Modified from response headers', () => {
    const headers = new Headers({
      ETag: '"abc"',
      'Last-Modified': 'Mon, 01 Jan 2024 00:00:00 GMT',
    });

    expect(getResponseValidators({ headers })).toEqual({
      etag: '"abc"',
      lastModified: 'Mon, 01 Jan 2024 00:00:00 GMT',
    });
  });

  test('detects usable validators when ETag exists', () => {
    expect(
      hasUsableResponseValidators({ etag: '"abc"', lastModified: null }),
    ).toBe(true);
  });

  test('detects usable validators when Last-Modified exists', () => {
    expect(
      hasUsableResponseValidators({
        etag: null,
        lastModified: 'Mon, 01 Jan 2024 00:00:00 GMT',
      }),
    ).toBe(true);
  });

  test('treats missing validators as unusable', () => {
    expect(hasUsableResponseValidators(EMPTY_RESPONSE_VALIDATORS)).toBe(false);
  });

  test('prefers ETag when choosing a validator key', () => {
    expect(
      getPreferredValidatorKey({
        etag: '"abc"',
        lastModified: 'Mon, 01 Jan 2024 00:00:00 GMT',
      }),
    ).toBe('"abc"');
  });

  test('falls back to Last-Modified when ETag is absent', () => {
    expect(
      getPreferredValidatorKey({
        etag: null,
        lastModified: 'Mon, 01 Jan 2024 00:00:00 GMT',
      }),
    ).toBe('Mon, 01 Jan 2024 00:00:00 GMT');
  });

  test('compares ETag when the new response has one', () => {
    expect(
      hasResponseValidatorsChanged(
        { etag: '"abc"', lastModified: 'old' },
        { etag: '"def"', lastModified: 'new' },
      ),
    ).toBe(true);
  });

  test('compares Last-Modified only when both responses lack ETag', () => {
    expect(
      hasResponseValidatorsChanged(
        { etag: null, lastModified: 'old' },
        { etag: null, lastModified: 'new' },
      ),
    ).toBe(true);
  });

  test('does not report a change when the preferred validator is unchanged', () => {
    expect(
      hasResponseValidatorsChanged(
        { etag: '"abc"', lastModified: 'old' },
        { etag: '"abc"', lastModified: 'new' },
      ),
    ).toBe(false);
  });

  test('does not report a change when the new response has no validators', () => {
    expect(
      hasResponseValidatorsChanged(
        { etag: '"abc"', lastModified: 'old' },
        EMPTY_RESPONSE_VALIDATORS,
      ),
    ).toBe(false);
  });

  test('does not report a change when responses share no validator type', () => {
    expect(
      hasResponseValidatorsChanged(
        { etag: '"abc"', lastModified: null },
        { etag: null, lastModified: 'Mon, 01 Jan 2024 00:00:00 GMT' },
      ),
    ).toBe(false);
  });

  test('does not switch from Last-Modified to ETag without shared fallback', () => {
    expect(
      hasResponseValidatorsChanged(
        { etag: null, lastModified: 'Mon, 01 Jan 2024 00:00:00 GMT' },
        { etag: '"abc"', lastModified: null },
      ),
    ).toBe(false);
  });

  test('uses Last-Modified when a later response drops ETag', () => {
    expect(
      hasResponseValidatorsChanged(
        { etag: '"abc"', lastModified: 'Mon, 01 Jan 2024 00:00:00 GMT' },
        { etag: null, lastModified: 'Tue, 02 Jan 2024 00:00:00 GMT' },
      ),
    ).toBe(true);
  });

  test('uses Last-Modified when an earlier response lacked ETag', () => {
    expect(
      hasResponseValidatorsChanged(
        { etag: null, lastModified: 'Mon, 01 Jan 2024 00:00:00 GMT' },
        { etag: '"abc"', lastModified: 'Tue, 02 Jan 2024 00:00:00 GMT' },
      ),
    ).toBe(true);
  });
});
