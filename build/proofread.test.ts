import { describe, expect, test } from 'bun:test';
import { getProofreadConfig } from './proofread';
import type { SiteVariables } from './types';

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
