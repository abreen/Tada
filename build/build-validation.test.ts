import path from 'path';
import { describe, expect, test } from 'bun:test';
import { findOutputConflicts, validateHomePage } from './build-validation';
import {
  indexSources,
  type SourceEntry,
  type TadaProjectScan,
} from './source-model';
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

describe('validateHomePage', () => {
  const roots = {
    contentDir: path.join(root, 'content'),
    publicDir: path.join(root, 'public'),
    distDir: path.join(root, 'dist'),
    processedExts: new Set(['md', 'html']),
  };

  function scanWith(
    sources: Record<
      string,
      Pick<SourceEntry, 'kind' | 'renderKind'> & { output: string }
    >,
  ): TadaProjectScan {
    return indexSources(
      roots,
      new Map(
        Object.entries(sources).map(([name, { kind, renderKind, output }]) => [
          path.join(root, name),
          {
            kind,
            renderKind,
            outputs: new Set([output]),
            targets: new Set([`/${output}`]),
          },
        ]),
      ),
    );
  }

  test.each(['content/index.md', 'content/index.html'])(
    'accepts %s as the home page',
    name => {
      const scan = scanWith({
        [name]: {
          kind: 'content',
          renderKind: 'plain-text-page',
          output: 'index.html',
        },
      });
      expect(validateHomePage(scan)).toEqual([]);
    },
  );

  test('reports a site without a root index page', () => {
    const scan = scanWith({
      'content/docs/index.md': {
        kind: 'content',
        renderKind: 'plain-text-page',
        output: 'docs/index.html',
      },
    });
    expect(validateHomePage(scan)).toEqual([
      {
        message:
          'content/index.md or content/index.html is required: it is the home page',
      },
    ]);
  });

  test.each([
    ['a skipped page', 'content/index.md', 'content', 'skip'],
    ['a public file', 'public/index.html', 'public', 'public-copy'],
  ] as const)('does not accept %s', (_, name, kind, renderKind) => {
    const scan = scanWith({
      [name]: { kind, renderKind, output: 'index.html' },
    });
    expect(validateHomePage(scan)).toHaveLength(1);
  });
});
