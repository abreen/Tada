import path from 'path';
import {
  PAGE_RENDER_KINDS,
  type SourceEntry,
  type TadaProjectScan,
} from '../source-model';
import type { TadaSnapshot } from '../site-build';
import type { AuthorScriptOutputs, AuthorScripts } from '../author-scripts';
import type { SiteVariables } from '../types';
import { isInside } from '../utils/paths';

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
    sameItems(a.targets, b.targets) &&
    JSON.stringify(a.scripts) === JSON.stringify(b.scripts)
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

/**
 * Pages to re-render after `src/` was recompiled: those that list a script
 * whose outputs were added, removed, or renamed. A changed site-wide script
 * affects every page.
 */
export function getScriptDependentSources(
  scan: TadaProjectScan,
  siteVariables: SiteVariables,
  previous: ReadonlyMap<string, AuthorScriptOutputs>,
  next: ReadonlyMap<string, AuthorScriptOutputs>,
): Set<string> {
  const changed = new Set(
    [...previous.keys(), ...next.keys()].filter(
      script =>
        JSON.stringify(previous.get(script)) !==
        JSON.stringify(next.get(script)),
    ),
  );
  const everyPage = (siteVariables.scripts ?? []).some(script =>
    changed.has(script),
  );
  const sources = new Set<string>();
  for (const [source, entry] of scan.sources) {
    if (!PAGE_RENDER_KINDS.has(entry.renderKind)) {
      continue;
    }
    if (
      everyPage ||
      (Array.isArray(entry.scripts) &&
        entry.scripts.some(script => changed.has(script)))
    ) {
      sources.add(source);
    }
  }
  return sources;
}

/**
 * Whether watch mode must recompile the scripts in `src/`: after any change
 * there, since imports such as Sass partials are not tracked one by one, or
 * when the site config and pages list different scripts than last time.
 */
export function shouldRecompileScripts({
  paths,
  srcDir,
  scripts,
  compiled,
}: {
  paths: ReadonlySet<string>;
  srcDir: string;
  scripts: readonly string[];
  compiled: AuthorScripts;
}): boolean {
  const srcChanged = [...paths].some(
    changed => changed === srcDir || isInside(srcDir, changed),
  );
  const requested = new Set(compiled.requested);
  return (
    srcChanged ||
    scripts.length !== requested.size ||
    scripts.some(script => !requested.has(script))
  );
}
