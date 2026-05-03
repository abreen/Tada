import fs from 'fs';
import path from 'path';
import {
  type TadaProjectScan,
  assertNoOutputPathConflicts,
} from '../source-model';
import type { Asset, HtmlOutputAnalysis, SiteVariables } from '../types';
import type { TadaBuildMeta } from './compiler-types';

export interface TadaSourceRecord {
  sourcePath: string;
  kind: 'content' | 'public';
  outputs: Map<string, string | Buffer>;
  htmlAnalysisByOutputPath?: Map<string, HtmlOutputAnalysis>;
  partialDeps: Set<string>;
  traceDeps: Set<string>;
  internalTargets: Set<string>;
  generatedOutputPaths: Set<string>;
  authorKey?: string;
}

export interface TadaOutputOwner {
  kind: 'content' | 'public';
  sourcePath: string;
}

export interface TadaSnapshot {
  siteVariables: SiteVariables;
  assetFiles: string[];
  navData: unknown;
  authorsData: unknown;
  contentRecords: Map<string, TadaSourceRecord>;
  publicRecords: Map<string, TadaSourceRecord>;
  outputOwners: Map<string, TadaOutputOwner>;
  reversePartialDeps: Map<string, Set<string>>;
  reverseTraceDeps: Map<string, Set<string>>;
  reverseInternalTargetDeps: Map<string, Set<string>>;
  reverseAuthorDeps: Map<string, Set<string>>;
  scan: TadaProjectScan;
}

function buildReverseMap(
  records: Iterable<TadaSourceRecord>,
  selector: (record: TadaSourceRecord) => Iterable<string>,
): Map<string, Set<string>> {
  const reverse = new Map<string, Set<string>>();

  for (const record of records) {
    for (const key of selector(record)) {
      if (!reverse.has(key)) {
        reverse.set(key, new Set());
      }
      reverse.get(key)!.add(record.sourcePath);
    }
  }

  return reverse;
}

function collectOutputOwners(snapshot: {
  contentRecords: Map<string, TadaSourceRecord>;
  publicRecords: Map<string, TadaSourceRecord>;
}): Map<string, TadaOutputOwner> {
  const owners = new Map<string, TadaOutputOwner>();

  for (const record of snapshot.contentRecords.values()) {
    for (const outputPath of record.outputs.keys()) {
      owners.set(outputPath, {
        kind: 'content',
        sourcePath: record.sourcePath,
      });
    }
  }

  for (const record of snapshot.publicRecords.values()) {
    for (const outputPath of record.outputs.keys()) {
      owners.set(outputPath, { kind: 'public', sourcePath: record.sourcePath });
    }
  }

  return owners;
}

export function createSnapshot({
  siteVariables,
  assetFiles,
  navData,
  authorsData,
  scan,
  contentRecords,
  publicRecords,
}: {
  siteVariables: SiteVariables;
  assetFiles: string[];
  navData: unknown;
  authorsData: unknown;
  scan: TadaProjectScan;
  contentRecords: Map<string, TadaSourceRecord>;
  publicRecords: Map<string, TadaSourceRecord>;
}): TadaSnapshot {
  const allRecords = [...contentRecords.values()];

  return {
    siteVariables,
    assetFiles,
    navData,
    authorsData,
    contentRecords,
    publicRecords,
    outputOwners: collectOutputOwners({ contentRecords, publicRecords }),
    reversePartialDeps: buildReverseMap(
      allRecords,
      record => record.partialDeps,
    ),
    reverseTraceDeps: buildReverseMap(allRecords, record => record.traceDeps),
    reverseInternalTargetDeps: buildReverseMap(
      allRecords,
      record => record.internalTargets,
    ),
    reverseAuthorDeps: buildReverseMap(allRecords, record =>
      record.authorKey ? [record.authorKey] : [],
    ),
    scan,
  };
}

export function collectSourceOutputs(
  assets: Asset[],
  generatedOutputPaths: Set<string>,
  stageDir: string,
): Map<string, string | Buffer> {
  const outputs = new Map<string, string | Buffer>();
  for (const asset of assets) {
    outputs.set(asset.assetPath, asset.content);
  }
  for (const outputPath of generatedOutputPaths) {
    outputs.set(outputPath, fs.readFileSync(path.join(stageDir, outputPath)));
  }
  return outputs;
}

function cloneHtmlOutputAnalysis(
  analysis: HtmlOutputAnalysis,
): HtmlOutputAnalysis {
  return { outgoingTargets: new Set(analysis.outgoingTargets) };
}

export function collectSourceHtmlAnalysis(
  assets: Asset[],
): Map<string, HtmlOutputAnalysis> {
  const htmlAnalysisByOutputPath = new Map<string, HtmlOutputAnalysis>();
  for (const asset of assets) {
    if (!asset.assetPath.endsWith('.html') || !asset.htmlAnalysis) {
      continue;
    }
    htmlAnalysisByOutputPath.set(
      asset.assetPath,
      cloneHtmlOutputAnalysis(asset.htmlAnalysis),
    );
  }
  return htmlAnalysisByOutputPath;
}

function collectHtmlAssetsByPath(
  contentRecords: Map<string, TadaSourceRecord>,
): Map<string, string> {
  const htmlAssetsByPath = new Map<string, string>();
  for (const record of contentRecords.values()) {
    for (const [outputPath, content] of record.outputs) {
      if (outputPath.endsWith('.html') && typeof content === 'string') {
        htmlAssetsByPath.set(outputPath, content);
      }
    }
  }
  return htmlAssetsByPath;
}

function collectHtmlAnalysisByPath(
  contentRecords: Map<string, TadaSourceRecord>,
): Map<string, HtmlOutputAnalysis> {
  const htmlAnalysisByPath = new Map<string, HtmlOutputAnalysis>();
  for (const record of contentRecords.values()) {
    if (!record.htmlAnalysisByOutputPath) {
      continue;
    }
    for (const [outputPath, analysis] of record.htmlAnalysisByOutputPath) {
      htmlAnalysisByPath.set(outputPath, cloneHtmlOutputAnalysis(analysis));
    }
  }
  return htmlAnalysisByPath;
}

export function createBuildMeta(snapshot: TadaSnapshot): TadaBuildMeta {
  return {
    htmlAssetsByPath: collectHtmlAssetsByPath(snapshot.contentRecords),
    htmlAnalysisByPath: collectHtmlAnalysisByPath(snapshot.contentRecords),
    siteVariables: snapshot.siteVariables,
  };
}

export { assertNoOutputPathConflicts, type TadaProjectScan };
