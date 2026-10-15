import { describe, expect, test } from 'bun:test';
import { toUtf16Offsets } from './proofread';

describe('toUtf16Offsets', () => {
  test('keeps offsets in text without astral characters', () => {
    const toUtf16 = toUtf16Offsets('Naïve café');
    expect(toUtf16(6)).toBe(6);
  });

  test('counts astral characters as two UTF-16 code units', () => {
    const text = '😀 😀 recieve';
    const toUtf16 = toUtf16Offsets(text);
    expect(text.slice(toUtf16(4), toUtf16(11))).toBe('recieve');
  });
});
