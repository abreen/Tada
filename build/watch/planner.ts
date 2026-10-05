import path from 'path';
import type { SourceEntry, TadaProjectScan } from '../source-model';
import type { TadaSnapshot } from '../site-build';

export interface TadaIncrementalWatchPlan {
  kind: 'incremental';
  scan: TadaProjectScan;
  renderSources: Set<string>;
  removeSources: Set<string>;
}

type TadaWatchPlan = { kind: 'full' } | TadaIncrementalWatchPlan;

function sameItems(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  return a.size === b.size && [...a].every(item => b.has(item));
}

function sameSourceEntry(a: SourceEntry, b: SourceEntry | undefined): boolean {
  return (
    b !== undefined &&
    a.kind === b.kind &&
    a.renderKind === b.renderKind &&
    sameItems(a.outputs, b.outputs) &&
    sameItems(a.targets, b.targets)
  );
}

export function diffAuthorKeys(previous: unknown, next: unknown): Set<string> {
  const asMap = (value: unknown): Record<string, unknown> =>
    value && typeof value === 'object'
      ? (value as Record<string, unknown>)
      : {};
  const before = asMap(previous);
  const after = asMap(next);
  return new Set(
    [...Object.keys(before), ...Object.keys(after)].filter(
      key => JSON.stringify(before[key]) !== JSON.stringify(after[key]),
    ),
  );
}

export function createTadaWatchPlan({
  snapshot,
  paths,
  scan,
  full = false,
  changedAuthors = new Set<string>(),
}: {
  snapshot: TadaSnapshot;
  paths: ReadonlySet<string>;
  scan: TadaProjectScan;
  full?: boolean;
  changedAuthors?: ReadonlySet<string>;
}): TadaWatchPlan {
  if (full) {
    return { kind: 'full' };
  }
  const renderSources = new Set<string>();
  const removeSources = new Set(
    [...snapshot.records.keys()].filter(source => !scan.sources.has(source)),
  );
  const include = (
    index: ReadonlyMap<string, ReadonlySet<string>>,
    key: string,
  ) => {
    for (const source of index.get(key) ?? []) {
      renderSources.add(source);
    }
  };
  const changedSources = new Set([...paths, ...removeSources]);
  for (const source of snapshot.scan.sources.keys()) {
    if (!scan.sources.has(source)) {
      changedSources.add(source);
    }
  }
  // A directory event may arrive without events for the files inside it.
  const changedDirPrefixes = [...paths].map(changed => changed + path.sep);
  for (const [source, entry] of scan.sources) {
    const inChangedDirectory = changedDirPrefixes.some(prefix =>
      source.startsWith(prefix),
    );
    if (
      inChangedDirectory ||
      !sameSourceEntry(entry, snapshot.scan.sources.get(source))
    ) {
      changedSources.add(source);
    }
  }
  for (const source of changedSources) {
    if (scan.sources.has(source)) {
      renderSources.add(source);
    }
    include(snapshot.fileDependents, source);
  }
  for (const key of changedAuthors) {
    include(snapshot.authorDependents, key);
  }
  for (const target of new Set([
    ...snapshot.scan.validTargets,
    ...scan.validTargets,
    ...snapshot.scan.generatedPageTargets,
    ...scan.generatedPageTargets,
  ])) {
    if (
      snapshot.scan.validTargets.has(target) !==
        scan.validTargets.has(target) ||
      snapshot.scan.generatedPageTargets.has(target) !==
        scan.generatedPageTargets.has(target)
    ) {
      include(snapshot.targetDependents, target);
    }
  }
  for (const target of new Set([
    ...snapshot.scan.codePageSourceTargets,
    ...scan.codePageSourceTargets,
  ])) {
    if (
      snapshot.scan.codePageSourceTargets.has(target) !==
      scan.codePageSourceTargets.has(target)
    ) {
      // Inbound links may have resolved to either the raw source or its page.
      include(snapshot.targetDependents, target);
      include(snapshot.targetDependents, `${target}.html`);
    }
  }
  for (const [output, producers] of scan.outputProducers) {
    for (const source of producers) {
      if (snapshot.outputs.get(output)?.sourcePath !== source) {
        renderSources.add(source);
      }
    }
  }
  for (const source of renderSources) {
    if (!scan.sources.has(source)) {
      renderSources.delete(source);
    }
  }
  return { kind: 'incremental', scan, renderSources, removeSources };
}
