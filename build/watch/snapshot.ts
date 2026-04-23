import fs from 'fs';
import path from 'path';
import { normalizeOutputPath } from '../util';
import {
  type TadaProjectScan,
  assertNoOutputPathConflicts,
  scanProject,
  updateProjectScan,
} from '../source-model';
import type { Asset, HtmlOutputAnalysis, SiteVariables } from '../types';

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

export interface TadaSnapshot {
  siteVariables: SiteVariables;
  assetFiles: string[];
  navData: unknown;
  authorsData: unknown;
  processedExts: Set<string>;
  contentRecords: Map<string, TadaSourceRecord>;
  publicRecords: Map<string, TadaSourceRecord>;
  outputOwners: Map<string, { kind: 'content' | 'public'; sourcePath: string }>;
  reversePartialDeps: Map<string, Set<string>>;
  reverseTraceDeps: Map<string, Set<string>>;
  reverseInternalTargetDeps: Map<string, Set<string>>;
  reverseAuthorDeps: Map<string, Set<string>>;
  contentFiles: Set<string>;
  buildContentFiles: Set<string>;
  publicFiles: Set<string>;
  literateJavaOutputPaths: Set<string>;
  contentOwners: Map<string, string>;
  publicOwners: Map<string, string>;
  sourceOutputPaths: Map<string, Set<string>>;
  sourceTargetPaths: Map<string, Set<string>>;
  validTargets: Set<string>;
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

function cloneSetMap(
  source: Map<string, Set<string>>,
): Map<string, Set<string>> {
  return new Map(
    [...source.entries()].map(([key, values]) => [key, new Set(values)]),
  );
}

export function collectOutputOwners(snapshot: {
  contentRecords: Map<string, TadaSourceRecord>;
  publicRecords: Map<string, TadaSourceRecord>;
}): Map<string, { kind: 'content' | 'public'; sourcePath: string }> {
  const owners = new Map<
    string,
    { kind: 'content' | 'public'; sourcePath: string }
  >();

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
  const reverseAuthorDeps = new Map<string, Set<string>>();
  for (const record of allRecords) {
    if (!record.authorKey) {
      continue;
    }
    if (!reverseAuthorDeps.has(record.authorKey)) {
      reverseAuthorDeps.set(record.authorKey, new Set());
    }
    reverseAuthorDeps.get(record.authorKey)!.add(record.sourcePath);
  }

  return {
    siteVariables,
    assetFiles,
    navData,
    authorsData,
    processedExts: scan.processedExts,
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
    reverseAuthorDeps,
    contentFiles: new Set(scan.contentFiles),
    buildContentFiles: new Set(scan.buildContentFiles),
    publicFiles: new Set(scan.publicFiles),
    literateJavaOutputPaths: new Set(scan.literateJavaOutputPaths),
    contentOwners: new Map(scan.contentOwners),
    publicOwners: new Map(scan.publicOwners),
    sourceOutputPaths: cloneSetMap(scan.sourceOutputPaths),
    sourceTargetPaths: cloneSetMap(scan.sourceTargetPaths),
    validTargets: new Set(scan.validTargets),
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

export function collectHtmlAssetsByPath(
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

export function collectHtmlAnalysisByPath(
  contentRecords: Map<string, TadaSourceRecord>,
): Map<string, HtmlOutputAnalysis> {
  const htmlAnalysisByPath = new Map<string, HtmlOutputAnalysis>();
  for (const record of contentRecords.values()) {
    for (const [outputPath, analysis] of record.htmlAnalysisByOutputPath ||
      new Map<string, HtmlOutputAnalysis>()) {
      htmlAnalysisByPath.set(outputPath, cloneHtmlOutputAnalysis(analysis));
    }
  }
  return htmlAnalysisByPath;
}

export function normalizeInternalTarget(target: string): string {
  return normalizeOutputPath(target);
}

export {
  assertNoOutputPathConflicts,
  scanProject,
  updateProjectScan,
  type TadaProjectScan,
};
