import { describe, expect, test } from 'bun:test';
import { getProofreadConfig, toUtf16Offsets } from './proofread';
import type { SiteVariables } from './types';

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

describe('getProofreadConfig', () => {
  const site = (proofread?: SiteVariables['proofread']) =>
    ({ proofread }) as SiteVariables;

  test('proofreads with no options by default', () => {
    expect(getProofreadConfig(site())).toEqual({});
  });

  test('returns the configured options', () => {
    expect(getProofreadConfig(site({ words: ['Tada'] }))).toEqual({
      words: ['Tada'],
    });
  });

  test('returns null when proofread is false', () => {
    expect(getProofreadConfig(site(false))).toBeNull();
  });
});
