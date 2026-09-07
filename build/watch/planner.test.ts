import path from 'path';
import { expect, test } from 'bun:test';
import { createTadaWatchPlan, diffAuthorKeys } from './planner';
import { indexSources, type SourceEntry } from '../source-model';
import { createSnapshot, type TadaSnapshot } from './snapshot';
import type { TadaSourceRecord } from '../source-records';

const root = path.resolve('planner-site');
const source = (name: string) => path.join(root, name);
const siteVariables: TadaSnapshot['siteVariables'] = {
  base: 'http://localhost',
  basePath: '/',
  title: 'Site',
  titlePostfix: ' - Site',
  themeColor: 'black',
  defaultTimeZone: 'America/New_York',
  features: { search: true, favicon: true, footer: true, pickers: true },
};
function record(
  name: string,
  outputs: string[],
  deps: Partial<TadaSourceRecord> = {},
): TadaSourceRecord {
  return {
    sourcePath: source(name),
    kind: name.startsWith('public/') ? 'public' : 'content',
    outputs: new Map(outputs.map(output => [output, output])),
    partialDeps: new Set(),
    traceDeps: new Set(),
    internalTargets: new Set(),
    generatedOutputPaths: new Set(),
    ...deps,
  };
}
function scan(records: TadaSourceRecord[]) {
  return indexSources(
    {
      contentDir: source('content'),
      publicDir: source('public'),
      distDir: source('dist'),
      processedExts: new Set(['md', 'html']),
    },
    new Map(
      records.map(record => [
        record.sourcePath,
        {
          kind: record.kind,
          renderKind:
            record.kind === 'public' ? 'public-copy' : 'plain-text-page',
          outputs: new Set(record.outputs.keys()),
          targets: new Set(
            [...record.outputs.keys()].map(output => '/' + output),
          ),
        } satisfies SourceEntry,
      ]),
    ),
  );
}
function snapshot(records: TadaSourceRecord[]) {
  return createSnapshot({
    siteVariables,
    assetFiles: [],
    authorsData: {},
    scan: scan(records),
    records: new Map(
      records
        .filter(record => record.outputs.size > 0)
        .map(record => [record.sourcePath, record]),
    ),
  });
}
function plan(
  before: TadaSourceRecord[],
  after: TadaSourceRecord[],
  changes: string[],
  extra: Partial<Parameters<typeof createTadaWatchPlan>[0]> = {},
) {
  const previous = snapshot(before);
  const nextScan = scan(after);
  const sources = new Map(nextScan.sources);
  for (const record of after) {
    if (
      before.includes(record) &&
      !changes.map(source).includes(record.sourcePath)
    ) {
      sources.set(
        record.sourcePath,
        previous.scan.sources.get(record.sourcePath)!,
      );
    }
  }
  const result = createTadaWatchPlan({
    snapshot: previous,
    scan: { ...nextScan, sources },
    paths: new Set(changes.map(source)),
    ...extra,
  });
  if (result.kind !== 'incremental') {
    throw new Error('expected incremental');
  }
  return result;
}

test('diffAuthorKeys returns changed and added keys only', () => {
  expect(
    diffAuthorKeys(
      { alex: { name: 'Alex' }, sam: { name: 'Sam' } },
      { alex: { name: 'Alexandra' }, sam: { name: 'Sam' }, taylor: {} },
    ),
  ).toEqual(new Set(['alex', 'taylor']));
});

test('partial edits rebuild dependents', () => {
  const partial = record('content/_greeting.md', []);
  const page = record('content/page.md', ['page.html'], {
    partialDeps: new Set([partial.sourcePath]),
  });
  const result = plan(
    [partial, page],
    [partial, page],
    ['content/_greeting.md'],
  );
  expect(result.renderSources).toEqual(
    new Set([partial.sourcePath, page.sourcePath]),
  );
});

test('deleting an unreferenced page leaves the root untouched', () => {
  const home = record('content/index.md', ['index.html']);
  const orphan = record('content/orphan.md', ['orphan.html']);
  const result = plan([home, orphan], [home], ['content/orphan.md']);
  expect(result.renderSources.size).toBe(0);
  expect(result.removeSources).toEqual(new Set([orphan.sourcePath]));
});

test('deleting a page does not rebuild siblings sharing its dependencies', () => {
  const deps = {
    partialDeps: new Set([source('content/_shared.md')]),
    traceDeps: new Set([source('content/Trace.java')]),
  };
  const removed = record('content/removed.md', ['removed.html'], deps);
  const sibling = record('content/sibling.md', ['sibling.html'], deps);
  const result = plan([removed, sibling], [sibling], ['content/removed.md']);
  expect(result.renderSources.size).toBe(0);
  expect(result.removeSources).toEqual(new Set([removed.sourcePath]));
});

test.each(['about.html', 'assets/logo.svg'])(
  'public handoff restores the content producer of %s',
  output => {
    const content = record('content/' + output, [output]);
    const pub = record('public/' + output, [output]);
    const result = plan([content, pub], [content], ['public/' + output]);
    expect(result.renderSources).toEqual(new Set([content.sourcePath]));
    expect(result.removeSources).toEqual(new Set([pub.sourcePath]));
  },
);

test('removing the previous owner rebuilds the surviving content producer', () => {
  const removed = record('content/about.md', ['about.html']);
  const survivor = record('content/about.html', ['about.html']);
  const result = plan([removed], [survivor], ['content/about.md']);
  expect(result.renderSources).toEqual(new Set([survivor.sourcePath]));
  expect(result.removeSources).toEqual(new Set([removed.sourcePath]));
});

test('file, target and author dependencies invalidate independently', () => {
  const trace = record('content/Trace.java', ['Trace.java']);
  const page = record('content/page.md', ['page.html'], {
    traceDeps: new Set([trace.sourcePath]),
    internalTargets: new Set(['/Trace.java']),
    authorKey: 'alex',
  });
  const plain = record('content/plain.md', ['plain.html']);
  expect(
    plan([page, plain, trace], [page, plain, trace], ['content/Trace.java'])
      .renderSources,
  ).toEqual(new Set([trace.sourcePath, page.sourcePath]));
  expect(
    plan([page, plain, trace], [page, plain], ['content/Trace.java'])
      .renderSources,
  ).toEqual(new Set([page.sourcePath]));
  expect(
    plan([page, plain], [page, plain], [], {
      changedAuthors: new Set(['alex']),
    }).renderSources,
  ).toEqual(new Set([page.sourcePath]));
});

test('skipping a page schedules its record replacement and invalidates inbound links', () => {
  const page = record('content/page.md', ['page.html']);
  const inbound = record('content/inbound.md', ['inbound.html'], {
    internalTargets: new Set(['/page.html']),
  });
  expect(
    plan(
      [page, inbound],
      [record('content/page.md', []), inbound],
      ['content/page.md'],
    ).renderSources,
  ).toEqual(new Set([page.sourcePath, inbound.sourcePath]));
});

test('explicit full rebuild decision does not consult the filesystem', () => {
  const before = snapshot([]);
  expect(
    createTadaWatchPlan({
      snapshot: before,
      scan: before.scan,
      paths: new Set(),
      full: true,
    }),
  ).toEqual({ kind: 'full' });
});

test('directory reconciliation invalidates partial dependents without individual file events', () => {
  const partial = record('content/parts/_shared.md', []);
  const page = record('content/page.md', ['page.html'], {
    partialDeps: new Set([partial.sourcePath]),
  });
  const nextPartial = record('content/parts/_shared.md', []);
  const unrelated = record('content/unrelated.md', ['unrelated.html']);
  expect(snapshot([partial, page]).records.has(partial.sourcePath)).toBe(false);
  expect(
    plan(
      [partial, page, unrelated],
      [nextPartial, page, unrelated],
      ['content/parts'],
    ).renderSources,
  ).toEqual(new Set([partial.sourcePath, page.sourcePath]));
  const deleted = plan(
    [partial, page, unrelated],
    [page, unrelated],
    ['content/parts'],
  );
  expect(deleted.renderSources).toEqual(new Set([page.sourcePath]));
  expect(deleted.removeSources.size).toBe(0);
});
