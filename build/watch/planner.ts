import type { TadaProjectScan } from '../source-model';
import type { TadaSnapshot } from './snapshot';

export interface TadaIncrementalWatchPlan {
  kind: 'incremental';
  scan: TadaProjectScan;
  renderSources: Set<string>;
  removeSources: Set<string>;
}

type TadaWatchPlan = { kind: 'full' } | TadaIncrementalWatchPlan;

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
  for (const [source, entry] of scan.sources) {
    if (entry !== snapshot.scan.sources.get(source)) {
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
  ])) {
    if (
      snapshot.scan.validTargets.has(target) !== scan.validTargets.has(target)
    ) {
      include(snapshot.targetDependents, target);
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
