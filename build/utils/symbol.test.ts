import { describe, expect, test } from 'bun:test';
import siteSchema from '../../schema/site.schema.json' with { type: 'json' };
import { compile } from '../json-schema';
import {
  isEmojiSymbol,
  isValidSymbol,
  SYMBOL_PATTERN,
  TEXT_SYMBOL_PATTERN,
} from './symbol';

const EMOJI = ['🎉', '❤️', '👩‍💻', '🇺🇸', '👋🏽', '🏴󠁧󠁢󠁥󠁮󠁧󠁿', '1️⃣', '🏳️‍🌈', '☕'];
const NOT_EMOJI = ['', 'TADA', 'CS 0', '❤', '🎉🎉', '🎉 ', 'A🎉', '©', '🇺'];

describe('isEmojiSymbol', () => {
  test.each(EMOJI)('accepts one emoji %p', value => {
    expect(isEmojiSymbol(value)).toBe(true);
    expect(isValidSymbol(value)).toBe(true);
  });

  test.each(NOT_EMOJI)('rejects %p', value => {
    expect(isEmojiSymbol(value)).toBe(false);
  });

  test('treats missing values as text', () => {
    expect(isEmojiSymbol(undefined)).toBe(false);
    expect(isEmojiSymbol(null)).toBe(false);
  });
});

describe('isValidSymbol', () => {
  test('still accepts uppercase text and rejects mixed text', () => {
    expect(isValidSymbol('CS 0')).toBe(true);
    expect(isValidSymbol('abc')).toBe(false);
    expect(isValidSymbol('🎉🎉')).toBe(false);
    expect(isValidSymbol('A🎉')).toBe(false);
  });
});

describe('site schema', () => {
  test('uses the shared symbol pattern', () => {
    expect(siteSchema.properties.symbol.pattern).toBe(SYMBOL_PATTERN);
    expect(siteSchema.properties.faviconSymbol.pattern).toBe(
      TEXT_SYMBOL_PATTERN,
    );
  });

  test('validates one emoji as a symbol', () => {
    const validate = compile({
      type: 'object',
      properties: { symbol: siteSchema.properties.symbol },
    });
    expect(validate({ symbol: '👩‍💻' })).toBe(true);
    expect(validate({ symbol: '🎉🎉' })).toBe(false);
  });

  test('keeps faviconSymbol to text', () => {
    const validate = compile({
      type: 'object',
      properties: { faviconSymbol: siteSchema.properties.faviconSymbol },
    });
    expect(validate({ faviconSymbol: 'CS 0' })).toBe(true);
    expect(validate({ faviconSymbol: '🚀' })).toBe(false);
  });
});
