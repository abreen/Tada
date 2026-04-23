import fs from 'fs';
import path from 'path';
import { parseFrontMatterAndContent } from './utils/front-matter';
import { getExtensionToShikiLanguage } from './site-variables';
import {
  extensionIsMarkdown,
  getProcessedExtensions,
  isLiterateJava,
  isPartial,
} from './utils/file-types';
import {
  getContentDir,
  getDistDir,
  getPublicDir,
  normalizeOutputPath,
  toPosix,
} from './utils/paths';
import type { ChangeBatch } from '../watch/types';
import type { SiteVariables } from './types';

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

export interface TadaProjectScanSnapshotLike {
  processedExts: Set<string>;
  contentFiles: Set<string>;
  buildContentFiles: Set<string>;
  publicFiles: Set<string>;
  literateJavaOutputPaths: Set<string>;
  contentOwners: Map<string, string>;
  publicOwners: Map<string, string>;
  sourceOutputPaths: Map<string, Set<string>>;
  sourceTargetPaths: Map<string, Set<string>>;
}

export function shouldSkipContentFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  if (!(extensionIsMarkdown(ext) || ext === '.html')) {
    return false;
  }

  const raw = fs.readFileSync(filePath, 'utf-8');
  const { pageVariables } = parseFrontMatterAndContent(raw, ext);
  return pageVariables?.skip === true;
}

export function getProcessedExts(codeExtensions: string[]): Set<string> {
  return new Set(
    getProcessedExtensions(codeExtensions).map(ext => ext.toLowerCase()),
  );
}

export function isBuildContentSource(
  filePath: string,
  processedExts: Set<string>,
): boolean {
  const ext = path.extname(filePath).slice(1).toLowerCase();
  if (!processedExts.has(ext) || isPartial(filePath)) {
    return false;
  }

  return !shouldSkipContentFile(filePath);
}

export function addGeneratedRouteAliases(
  pathSet: Set<string>,
  outputPath: string,
): void {
  const normalizedPath = normalizeOutputPath(outputPath);
  pathSet.add(normalizedPath);

  if (!normalizedPath.endsWith('/index.html')) {
    return;
  }

  const base = normalizedPath.slice(0, -'index.html'.length);
  pathSet.add(base);
  if (base.endsWith('/') && base.length > 1) {
    pathSet.add(base.slice(0, -1));
  }
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

function cloneSetMap(
  source: Map<string, Set<string>>,
): Map<string, Set<string>> {
  return new Map(
    [...source.entries()].map(([key, values]) => [key, new Set(values)]),
  );
}

function addContentSourceToScan({
  scan,
  filePath,
}: {
  scan: TadaProjectScan;
  filePath: string;
}): void {
  const buildContent = isBuildContentSource(filePath, scan.processedExts);

  scan.contentFiles.add(filePath);
  if (buildContent) {
    scan.buildContentFiles.add(filePath);
  }
  if (buildContent && isLiterateJava(filePath)) {
    const parsed = path.parse(path.relative(scan.contentDir, filePath));
    scan.literateJavaOutputPaths.add(
      `/${toPosix(path.join(parsed.dir, parsed.name))}`,
    );
  }

  const outputs = getSourceOutputPaths({
    contentDir: scan.contentDir,
    filePath,
    processedExts: scan.processedExts,
    buildContent,
  });
  scan.sourceOutputPaths.set(filePath, outputs);
  for (const outputPath of outputs) {
    scan.contentOwners.set(outputPath, filePath);
  }

  const targets = getSourceTargetPaths({
    kind: 'content',
    rootDir: scan.contentDir,
    filePath,
    processedExts: scan.processedExts,
    buildContent,
  });
  scan.sourceTargetPaths.set(filePath, targets);
  for (const target of targets) {
    scan.validTargets.add(target);
  }
}

function addPublicSourceToScan({
  scan,
  filePath,
}: {
  scan: TadaProjectScan;
  filePath: string;
}): void {
  const relPath = toPosix(path.relative(scan.publicDir, filePath));

  scan.publicFiles.add(filePath);
  scan.publicOwners.set(relPath, filePath);
  scan.sourceOutputPaths.set(filePath, new Set([relPath]));

  const targets = getSourceTargetPaths({
    kind: 'public',
    rootDir: scan.publicDir,
    filePath,
    processedExts: scan.processedExts,
    buildContent: false,
  });
  scan.sourceTargetPaths.set(filePath, targets);
  for (const target of targets) {
    scan.validTargets.add(target);
  }
}

function collectValidTargets(
  sourceTargetPaths: Map<string, Set<string>>,
): Set<string> {
  const validTargets = new Set<string>();
  for (const targets of sourceTargetPaths.values()) {
    for (const target of targets) {
      validTargets.add(target);
    }
  }
  return validTargets;
}

function createEmptyScan(processedExts: Set<string>): TadaProjectScan {
  return {
    contentDir: getContentDir(),
    publicDir: getPublicDir(),
    distDir: getDistDir(),
    contentFiles: new Set(),
    buildContentFiles: new Set(),
    publicFiles: new Set(),
    validTargets: new Set(),
    literateJavaOutputPaths: new Set(),
    processedExts,
    contentOwners: new Map(),
    publicOwners: new Map(),
    sourceOutputPaths: new Map(),
    sourceTargetPaths: new Map(),
  };
}

export function getSourceOutputPaths({
  contentDir,
  filePath,
  processedExts,
  buildContent,
}: {
  contentDir: string;
  filePath: string;
  processedExts: Set<string>;
  buildContent: boolean;
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
  outputs.add(`${relPath}.html`);
  return outputs;
}

export function getSourceTargetPaths({
  kind,
  rootDir,
  filePath,
  processedExts,
  buildContent,
}: {
  kind: 'content' | 'public';
  rootDir: string;
  filePath: string;
  processedExts: Set<string>;
  buildContent: boolean;
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

  addGeneratedRouteAliases(targets, `/${relPath}.html`);
  targets.add(normalizeOutputPath(`/${relPath}`));
  return targets;
}

export function scanProject(siteVariables: SiteVariables): TadaProjectScan {
  const scan = createEmptyScan(
    getProcessedExts(Object.keys(getExtensionToShikiLanguage(siteVariables))),
  );

  for (const filePath of walkFiles(scan.contentDir).sort()) {
    addContentSourceToScan({ scan, filePath });
  }

  for (const filePath of walkFiles(scan.publicDir).sort()) {
    addPublicSourceToScan({ scan, filePath });
  }

  return scan;
}

export function updateProjectScan(
  snapshot: TadaProjectScanSnapshotLike,
  batch: ChangeBatch,
): TadaProjectScan {
  const scan = createEmptyScan(snapshot.processedExts);
  scan.contentFiles = new Set(snapshot.contentFiles);
  scan.buildContentFiles = new Set(snapshot.buildContentFiles);
  scan.publicFiles = new Set(snapshot.publicFiles);
  scan.literateJavaOutputPaths = new Set(snapshot.literateJavaOutputPaths);
  scan.contentOwners = new Map(snapshot.contentOwners);
  scan.publicOwners = new Map(snapshot.publicOwners);
  scan.sourceOutputPaths = cloneSetMap(snapshot.sourceOutputPaths);
  scan.sourceTargetPaths = cloneSetMap(snapshot.sourceTargetPaths);
  scan.validTargets = collectValidTargets(scan.sourceTargetPaths);

  for (const change of batch.changes) {
    const sourcePath = path.resolve(change.path);
    const inContent = sourcePath.startsWith(`${scan.contentDir}${path.sep}`);
    const inPublic = sourcePath.startsWith(`${scan.publicDir}${path.sep}`);
    if (!inContent && !inPublic) {
      continue;
    }

    for (const outputPath of scan.sourceOutputPaths.get(sourcePath) || []) {
      if (inContent) {
        scan.contentOwners.delete(outputPath);
      } else {
        scan.publicOwners.delete(outputPath);
      }
    }

    scan.sourceOutputPaths.delete(sourcePath);
    scan.sourceTargetPaths.delete(sourcePath);
    scan.contentFiles.delete(sourcePath);
    scan.buildContentFiles.delete(sourcePath);
    scan.publicFiles.delete(sourcePath);

    if (inContent && isLiterateJava(sourcePath)) {
      const parsed = path.parse(path.relative(scan.contentDir, sourcePath));
      scan.literateJavaOutputPaths.delete(
        `/${toPosix(path.join(parsed.dir, parsed.name))}`,
      );
    }

    if (!fs.existsSync(sourcePath) || !fs.statSync(sourcePath).isFile()) {
      continue;
    }

    if (inContent) {
      addContentSourceToScan({ scan, filePath: sourcePath });
      continue;
    }

    addPublicSourceToScan({ scan, filePath: sourcePath });
  }

  scan.validTargets = collectValidTargets(scan.sourceTargetPaths);
  return scan;
}

export function assertNoOutputPathConflicts(scan: TadaProjectScan): string[] {
  const conflicts = [...scan.contentOwners.keys()].filter(relPath =>
    scan.publicOwners.has(relPath),
  );
  return conflicts.sort();
}
