import path from 'path';
import { describe, expect, test } from 'bun:test';
import { findOutputConflicts } from './build-validation';
import type { TadaProjectScan } from './source-model';
import type { TadaSourceRecord } from './source-records';
import type { OutputContent, SiteVariables } from './types';

const root = path.resolve('validation-site');
const scan = {
  contentDir: path.join(root, 'content'),
  outputProducers: new Map(),
} as unknown as TadaProjectScan;
const siteVariables = {
  features: { search: true, favicon: false, footer: true, pickers: true },
} as SiteVariables;

function record(
  name: string,
  outputs: Record<string, OutputContent>,
): [string, TadaSourceRecord] {
  const sourcePath = path.join(root, name);
  return [
    sourcePath,
    {
      sourcePath,
      outputs: new Map(Object.entries(outputs)),
    } as TadaSourceRecord,
  ];
}

describe('findOutputConflicts', () => {
  const trace = 'labs/_traces/Demo/sha256-abc/manifest.json';

  test('allows pages that write the same trace file', () => {
    const records = new Map([
      record('content/labs/a.md', { [trace]: '{"steps":1}' }),
      record('content/labs/b.md', { [trace]: '{"steps":1}' }),
    ]);
    expect(
      findOutputConflicts(scan, siteVariables, new Map(), records),
    ).toEqual([]);
  });

  test('reports different sources writing different content to one path', () => {
    const records = new Map([
      record('content/labs/a.md', { [trace]: '{"steps":1}' }),
      record(`public/${trace}`, {
        [trace]: { copyFrom: path.join(root, 'public', trace) },
      }),
    ]);
    expect(
      findOutputConflicts(scan, siteVariables, new Map(), records),
    ).toEqual([
      { message: `content/labs/a.md, public/${trace}: both write ${trace}` },
    ]);
  });
});
