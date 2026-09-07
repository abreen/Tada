import type { SiteVariables } from '../types';
import type { BuildDiagnostic, TadaBuildMeta } from '../build-types';
import type { CommitPlan } from '../output-publication';
import type { TadaProjectScan } from '../source-model';
import type { TadaSourceRecord } from '../source-records';

export interface TadaSnapshot {
  siteVariables: SiteVariables;
  assetFiles: string[];
  authorsData: unknown;
  records: ReadonlyMap<string, TadaSourceRecord>;
  outputs: ReadonlyMap<
    string,
    { sourcePath: string; content: string | Buffer }
  >;
  fileDependents: ReadonlyMap<string, ReadonlySet<string>>;
  targetDependents: ReadonlyMap<string, ReadonlySet<string>>;
  authorDependents: ReadonlyMap<string, ReadonlySet<string>>;
  scan: TadaProjectScan;
}

type SnapshotInputs = Pick<
  TadaSnapshot,
  'siteVariables' | 'assetFiles' | 'authorsData' | 'records' | 'scan'
>;

export function createSnapshot(inputs: SnapshotInputs): TadaSnapshot {
  const outputs = new Map<
    string,
    { sourcePath: string; content: string | Buffer }
  >();
  const fileDependents = new Map<string, Set<string>>();
  const targetDependents = new Map<string, Set<string>>();
  const authorDependents = new Map<string, Set<string>>();
  for (const record of inputs.records.values()) {
    for (const [output, content] of record.outputs) {
      outputs.set(output, { sourcePath: record.sourcePath, content });
    }
    for (const [index, keys] of [
      [fileDependents, [...record.partialDeps, ...record.traceDeps]],
      [targetDependents, record.internalTargets],
      [authorDependents, record.authorKey ? [record.authorKey] : []],
    ] as const) {
      for (const key of keys) {
        if (!index.has(key)) {
          index.set(key, new Set());
        }
        index.get(key)!.add(record.sourcePath);
      }
    }
  }
  return {
    ...inputs,
    outputs,
    fileDependents,
    targetDependents,
    authorDependents,
  };
}

export function createBuildMeta(snapshot: TadaSnapshot): TadaBuildMeta {
  const htmlAssetsByPath = new Map<string, string>();
  const htmlAnalysisByPath: TadaBuildMeta['htmlAnalysisByPath'] = new Map();
  for (const record of snapshot.records.values()) {
    if (record.kind !== 'content') {
      continue;
    }
    for (const [output, content] of record.outputs) {
      if (output.endsWith('.html') && typeof content === 'string') {
        htmlAssetsByPath.set(output, content);
      }
    }
    for (const [output, analysis] of record.htmlAnalysisByOutputPath ?? []) {
      htmlAnalysisByPath.set(output, {
        outgoingTargets: new Set(analysis.outgoingTargets),
      });
    }
  }
  return {
    htmlAssetsByPath,
    htmlAnalysisByPath,
    siteVariables: snapshot.siteVariables,
  };
}

export type CompilerBuildResult =
  | {
      ok: true;
      snapshot: TadaSnapshot;
      commit: CommitPlan;
      meta: TadaBuildMeta;
    }
  | { ok: false; diagnostics: BuildDiagnostic[] };
