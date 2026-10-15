import { describe, expect, test } from 'bun:test';
import { getProofreadConfig, proofreadRecord } from './proofread';
import type { TadaSourceRecord } from './source-records';
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

describe('proofreadRecord', () => {
  function record(html: string): TadaSourceRecord {
    return {
      sourcePath: 'content/index.md',
      kind: 'content',
      outputs: new Map([['index.html', html]]),
      partialDeps: new Set(),
      traceDeps: new Set(),
      internalTargets: new Set(),
      wikiTitles: new Set(),
    };
  }

  test('keeps a page unproofread when proofreading it fails', async () => {
    const html =
      '<html><head></head><body><main><p>Hi.</p></main></body></html>';
    const page = record(html);
    await Promise.all(
      proofreadRecord(page, () => Promise.reject(new Error('broken'))),
    );
    expect(page.outputs.get('index.html')).toBe(html);
  });
});
