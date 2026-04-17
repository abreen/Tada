import fs from 'fs';
import path from 'path';
import {
  getContentDir,
  getDistDir,
  getPublicDir,
  normalizeOutputPath,
  shouldSkipContentFile,
  toPosix,
} from '../util';
import { isFeatureEnabled } from '../features';
import {
  extensionIsMarkdown,
  getProcessedExtensions,
  isLiterateJava,
  isPartial,
} from '../utils/file-types';
import type { ChangeBatch } from '../../watch/types';
import type { Asset, SiteVariables } from '../types';

export interface TadaSourceRecord {
  sourcePath: string;
  kind: 'content' | 'public';
  outputs: Map<string, string | Buffer>;
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

export interface TadaProjectScan {
  contentDir: string;
  publicDir: string;
  distDir: string;
  contentFiles: Set<string>;
  buildContentFiles: Set<string>;
  publicFiles: Set<string>;
  validTargets: Set<string>;
  literateJavaOutputPaths: Set<string>;
  processedExts: Set<string>;
  contentOwners: Map<string, string>;
  publicOwners: Map<string, string>;
  sourceOutputPaths: Map<string, Set<string>>;
  sourceTargetPaths: Map<string, Set<string>>;
}

function walkFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) {
    return [];
  }

  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return walkFiles(fullPath);
    }
    if (entry.isFile()) {
      return [fullPath];
    }
    return [];
  });
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

function getProcessedExts(siteVariables: SiteVariables): Set<string> {
  return new Set(
    getProcessedExtensions(Object.keys(siteVariables.codeLanguages || {})).map(
      ext => ext.toLowerCase(),
    ),
  );
}

function isBuildContentSource(
  filePath: string,
  processedExts: Set<string>,
): boolean {
  const ext = path.extname(filePath).slice(1).toLowerCase();
  if (!processedExts.has(ext) || isPartial(filePath)) {
    return false;
  }
  return !shouldSkipContentFile(filePath);
}

function addGeneratedRouteAliases(
  targets: Set<string>,
  outputPath: string,
): void {
  const normalizedPath = normalizeOutputPath(outputPath);
  targets.add(normalizedPath);
  if (!normalizedPath.endsWith('/index.html')) {
    return;
  }
  const base = normalizedPath.slice(0, -'index.html'.length);
  targets.add(base);
  if (base.endsWith('/') && base.length > 1) {
    targets.add(base.slice(0, -1));
  }
}

function getContentOutputPathsForSource({
  contentDir,
  filePath,
  processedExts,
  buildContent,
  codeEnabled,
}: {
  contentDir: string;
  filePath: string;
  processedExts: Set<string>;
  buildContent: boolean;
  codeEnabled: boolean;
}): Set<string> {
  const relPath = toPosix(path.relative(contentDir, filePath));
  const parsed = path.parse(relPath);
  const ext = path.extname(filePath).slice(1).toLowerCase();
  const outputs = new Set<string>();

  if (!processedExts.has(ext)) {
    outputs.add(relPath);
    return outputs;
  }

  if (!buildContent) {
    return outputs;
  }

  if (isLiterateJava(filePath)) {
    outputs.add(toPosix(path.join(parsed.dir, `${parsed.name}.html`)));
    outputs.add(toPosix(path.join(parsed.dir, parsed.name)));
    return outputs;
  }

  if (
    extensionIsMarkdown(parsed.ext.toLowerCase()) ||
    parsed.ext.toLowerCase() === '.html'
  ) {
    outputs.add(toPosix(path.join(parsed.dir, `${parsed.name}.html`)));
    return outputs;
  }

  outputs.add(relPath);
  if (codeEnabled) {
    outputs.add(`${relPath}.html`);
  }
  return outputs;
}

function getTargetPathsForSource({
  kind,
  rootDir,
  filePath,
  processedExts,
  buildContent,
  codeEnabled,
}: {
  kind: 'content' | 'public';
  rootDir: string;
  filePath: string;
  processedExts: Set<string>;
  buildContent: boolean;
  codeEnabled: boolean;
}): Set<string> {
  const targets = new Set<string>();
  const relPath = toPosix(path.relative(rootDir, filePath));

  if (kind === 'public') {
    targets.add(normalizeOutputPath(`/${relPath}`));
    return targets;
  }

  const ext = path.extname(filePath).slice(1).toLowerCase();
  if (!processedExts.has(ext)) {
    targets.add(normalizeOutputPath(`/${relPath}`));
    return targets;
  }

  if (!buildContent || isPartial(filePath)) {
    return targets;
  }

  const parsed = path.parse(relPath);
  const subPath = toPosix(path.join(parsed.dir, parsed.name));

  if (isLiterateJava(filePath)) {
    const javaSubPath = toPosix(path.join(parsed.dir, parsed.name));
    addGeneratedRouteAliases(targets, `/${javaSubPath}.html`);
    targets.add(normalizeOutputPath(`/${javaSubPath}`));
    return targets;
  }

  if (
    extensionIsMarkdown(parsed.ext.toLowerCase()) ||
    parsed.ext.toLowerCase() === '.html'
  ) {
    addGeneratedRouteAliases(targets, `/${subPath}.html`);
    return targets;
  }

  if (codeEnabled) {
    addGeneratedRouteAliases(targets, `/${relPath}.html`);
  }
  targets.add(normalizeOutputPath(`/${relPath}`));
  return targets;
}

function cloneSetMap(
  source: Map<string, Set<string>>,
): Map<string, Set<string>> {
  return new Map(
    [...source.entries()].map(([key, values]) => [key, new Set(values)]),
  );
}

export function scanProject(siteVariables: SiteVariables): TadaProjectScan {
  const contentDir = getContentDir();
  const publicDir = getPublicDir();
  const distDir = getDistDir();
  const processedExts = getProcessedExts(siteVariables);
  const codeEnabled = isFeatureEnabled(siteVariables, 'code');
  const contentFiles = new Set(walkFiles(contentDir).sort());
  const publicFiles = new Set(walkFiles(publicDir).sort());
  const buildContentFiles = new Set<string>();
  const literateJavaOutputPaths = new Set<string>();
  const contentOwners = new Map<string, string>();
  const publicOwners = new Map<string, string>();
  const sourceOutputPaths = new Map<string, Set<string>>();
  const sourceTargetPaths = new Map<string, Set<string>>();
  const validTargets = new Set<string>();

  for (const filePath of contentFiles) {
    const buildContent = isBuildContentSource(filePath, processedExts);
    if (buildContent) {
      buildContentFiles.add(filePath);
    }
    if (buildContent && isLiterateJava(filePath)) {
      const parsed = path.parse(path.relative(contentDir, filePath));
      literateJavaOutputPaths.add(
        `/${toPosix(path.join(parsed.dir, parsed.name))}`,
      );
    }

    const outputs = getContentOutputPathsForSource({
      contentDir,
      filePath,
      processedExts,
      buildContent,
      codeEnabled,
    });
    sourceOutputPaths.set(filePath, outputs);
    for (const outputPath of outputs) {
      contentOwners.set(outputPath, filePath);
    }

    const targets = getTargetPathsForSource({
      kind: 'content',
      rootDir: contentDir,
      filePath,
      processedExts,
      buildContent,
      codeEnabled,
    });
    sourceTargetPaths.set(filePath, targets);
    for (const target of targets) {
      validTargets.add(target);
    }
  }

  for (const filePath of publicFiles) {
    const relPath = toPosix(path.relative(publicDir, filePath));
    publicOwners.set(relPath, filePath);
    sourceOutputPaths.set(filePath, new Set([relPath]));
    const targets = getTargetPathsForSource({
      kind: 'public',
      rootDir: publicDir,
      filePath,
      processedExts,
      buildContent: false,
      codeEnabled,
    });
    sourceTargetPaths.set(filePath, targets);
    for (const target of targets) {
      validTargets.add(target);
    }
  }

  return {
    contentDir,
    publicDir,
    distDir,
    contentFiles,
    buildContentFiles,
    publicFiles,
    validTargets,
    literateJavaOutputPaths,
    processedExts,
    contentOwners,
    publicOwners,
    sourceOutputPaths,
    sourceTargetPaths,
  };
}

export function updateProjectScan(
  snapshot: TadaSnapshot,
  batch: ChangeBatch,
): TadaProjectScan {
  const contentDir = getContentDir();
  const publicDir = getPublicDir();
  const distDir = getDistDir();
  const codeEnabled = isFeatureEnabled(snapshot.siteVariables, 'code');
  const contentFiles = new Set(snapshot.contentFiles);
  const buildContentFiles = new Set(snapshot.buildContentFiles);
  const publicFiles = new Set(snapshot.publicFiles);
  const literateJavaOutputPaths = new Set(snapshot.literateJavaOutputPaths);
  const contentOwners = new Map(snapshot.contentOwners);
  const publicOwners = new Map(snapshot.publicOwners);
  const sourceOutputPaths = cloneSetMap(snapshot.sourceOutputPaths);
  const sourceTargetPaths = cloneSetMap(snapshot.sourceTargetPaths);

  for (const change of batch.changes) {
    const sourcePath = path.resolve(change.path);
    const inContent = sourcePath.startsWith(`${contentDir}${path.sep}`);
    const inPublic = sourcePath.startsWith(`${publicDir}${path.sep}`);
    if (!inContent && !inPublic) {
      continue;
    }

    for (const outputPath of sourceOutputPaths.get(sourcePath) || []) {
      if (inContent) {
        contentOwners.delete(outputPath);
      } else {
        publicOwners.delete(outputPath);
      }
    }
    sourceOutputPaths.delete(sourcePath);
    sourceTargetPaths.delete(sourcePath);
    contentFiles.delete(sourcePath);
    buildContentFiles.delete(sourcePath);
    publicFiles.delete(sourcePath);

    if (inContent && isLiterateJava(sourcePath)) {
      const parsed = path.parse(path.relative(contentDir, sourcePath));
      literateJavaOutputPaths.delete(
        `/${toPosix(path.join(parsed.dir, parsed.name))}`,
      );
    }

    if (!fs.existsSync(sourcePath) || !fs.statSync(sourcePath).isFile()) {
      continue;
    }

    if (inContent) {
      const buildContent = isBuildContentSource(
        sourcePath,
        snapshot.processedExts,
      );
      contentFiles.add(sourcePath);
      if (buildContent) {
        buildContentFiles.add(sourcePath);
      }
      if (buildContent && isLiterateJava(sourcePath)) {
        const parsed = path.parse(path.relative(contentDir, sourcePath));
        literateJavaOutputPaths.add(
          `/${toPosix(path.join(parsed.dir, parsed.name))}`,
        );
      }

      const outputs = getContentOutputPathsForSource({
        contentDir,
        filePath: sourcePath,
        processedExts: snapshot.processedExts,
        buildContent,
        codeEnabled,
      });
      sourceOutputPaths.set(sourcePath, outputs);
      for (const outputPath of outputs) {
        contentOwners.set(outputPath, sourcePath);
      }

      sourceTargetPaths.set(
        sourcePath,
        getTargetPathsForSource({
          kind: 'content',
          rootDir: contentDir,
          filePath: sourcePath,
          processedExts: snapshot.processedExts,
          buildContent,
          codeEnabled,
        }),
      );
      continue;
    }

    const relPath = toPosix(path.relative(publicDir, sourcePath));
    publicFiles.add(sourcePath);
    publicOwners.set(relPath, sourcePath);
    sourceOutputPaths.set(sourcePath, new Set([relPath]));
    sourceTargetPaths.set(
      sourcePath,
      getTargetPathsForSource({
        kind: 'public',
        rootDir: publicDir,
        filePath: sourcePath,
        processedExts: snapshot.processedExts,
        buildContent: false,
        codeEnabled,
      }),
    );
  }

  const validTargets = new Set<string>();
  for (const targets of sourceTargetPaths.values()) {
    for (const target of targets) {
      validTargets.add(target);
    }
  }

  return {
    contentDir,
    publicDir,
    distDir,
    contentFiles,
    buildContentFiles,
    publicFiles,
    validTargets,
    literateJavaOutputPaths,
    processedExts: snapshot.processedExts,
    contentOwners,
    publicOwners,
    sourceOutputPaths,
    sourceTargetPaths,
  };
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

export function assertNoOutputPathConflicts(scan: TadaProjectScan): string[] {
  const conflicts = [...scan.contentOwners.keys()].filter(relPath =>
    scan.publicOwners.has(relPath),
  );
  return conflicts.sort();
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

export function normalizeInternalTarget(target: string): string {
  return normalizeOutputPath(target);
}
