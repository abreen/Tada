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
import type { SiteVariables } from './types';

export type TadaSourceRenderKind =
  | 'skip'
  | 'plain-text-page'
  | 'literate-java'
  | 'code-page'
  | 'content-copy'
  | 'public-copy';

export interface SourceEntry {
  readonly kind: 'content' | 'public';
  readonly renderKind: TadaSourceRenderKind;
  readonly outputs: ReadonlySet<string>;
  readonly targets: ReadonlySet<string>;
}

export interface TadaProjectScan {
  readonly contentDir: string;
  readonly publicDir: string;
  readonly distDir: string;
  readonly processedExts: ReadonlySet<string>;
  readonly sources: ReadonlyMap<string, SourceEntry>;
  readonly outputProducers: ReadonlyMap<string, ReadonlySet<string>>;
  readonly validTargets: ReadonlySet<string>;
  readonly literateJavaOutputPaths: ReadonlySet<string>;
}

export function* sourcePaths(
  scan: TadaProjectScan,
  kind?: SourceEntry['kind'],
  pagesOnly = false,
): Iterable<string> {
  for (const [filePath, entry] of scan.sources) {
    if (kind && entry.kind !== kind) {
      continue;
    }
    if (
      pagesOnly &&
      ['skip', 'content-copy', 'public-copy'].includes(entry.renderKind)
    ) {
      continue;
    }
    yield filePath;
  }
}

export function getSourceRenderKind(
  filePath: string,
  kind: SourceEntry['kind'],
  processedExts: ReadonlySet<string>,
  buildContent: boolean,
): TadaSourceRenderKind {
  const ext = path.extname(filePath).toLowerCase();
  if (kind === 'public') {
    return 'public-copy';
  }
  if (!processedExts.has(ext.slice(1))) {
    return 'content-copy';
  }
  if (!buildContent) {
    return 'skip';
  }
  if (isLiterateJava(filePath)) {
    return 'literate-java';
  }
  return extensionIsMarkdown(ext) || ext === '.html'
    ? 'plain-text-page'
    : 'code-page';
}

function createSourceEntry(
  scan: Pick<TadaProjectScan, 'contentDir' | 'publicDir' | 'processedExts'>,
  filePath: string,
  kind: SourceEntry['kind'],
): SourceEntry {
  const buildContent =
    kind === 'content' && isBuildContentSource(filePath, scan.processedExts);
  const renderKind = getSourceRenderKind(
    filePath,
    kind,
    scan.processedExts,
    buildContent,
  );
  const rootDir = kind === 'content' ? scan.contentDir : scan.publicDir;
  return {
    kind,
    renderKind,
    outputs:
      kind === 'public'
        ? new Set([toPosix(path.relative(rootDir, filePath))])
        : getSourceOutputPaths({
            contentDir: rootDir,
            filePath,
            processedExts: scan.processedExts,
            buildContent,
          }),
    targets: getSourceTargetPaths({
      kind,
      rootDir,
      filePath,
      processedExts: scan.processedExts,
      buildContent,
    }),
  };
}

export function indexSources(
  roots: Pick<
    TadaProjectScan,
    'contentDir' | 'publicDir' | 'distDir' | 'processedExts'
  >,
  sources: ReadonlyMap<string, SourceEntry>,
): TadaProjectScan {
  const outputProducers = new Map<string, Set<string>>();
  const validTargets = new Set<string>();
  const literateJavaOutputPaths = new Set<string>();
  for (const [filePath, entry] of sources) {
    for (const output of entry.outputs) {
      if (!outputProducers.has(output)) {
        outputProducers.set(output, new Set());
      }
      outputProducers.get(output)!.add(filePath);
    }
    for (const target of entry.targets) {
      validTargets.add(target);
    }
    if (entry.renderKind === 'literate-java') {
      const parsed = path.parse(path.relative(roots.contentDir, filePath));
      literateJavaOutputPaths.add(
        `/${toPosix(path.join(parsed.dir, parsed.name))}`,
      );
    }
  }
  return {
    ...roots,
    sources,
    outputProducers,
    validTargets,
    literateJavaOutputPaths,
  };
}

export function scanProject(siteVariables: SiteVariables): TadaProjectScan {
  const roots = {
    contentDir: getContentDir(),
    publicDir: getPublicDir(),
    distDir: getDistDir(),
    processedExts: getProcessedExts(
      Object.keys(getExtensionToShikiLanguage(siteVariables)),
    ),
  };
  const sources = new Map<string, SourceEntry>();
  for (const kind of ['content', 'public'] as const) {
    const dir = kind === 'content' ? roots.contentDir : roots.publicDir;
    for (const filePath of walkFiles(dir).sort()) {
      sources.set(filePath, createSourceEntry(roots, filePath, kind));
    }
  }
  return indexSources(roots, sources);
}

export function updateProjectScan(
  snapshot: TadaProjectScan,
  paths: ReadonlySet<string>,
): TadaProjectScan {
  const sources = new Map(snapshot.sources);
  for (const sourcePath of paths) {
    const kind = sourcePath.startsWith(`${snapshot.contentDir}${path.sep}`)
      ? 'content'
      : sourcePath.startsWith(`${snapshot.publicDir}${path.sep}`)
        ? 'public'
        : undefined;
    if (!kind) {
      continue;
    }
    sources.delete(sourcePath);
    const stat = fs.existsSync(sourcePath)
      ? fs.statSync(sourcePath)
      : undefined;
    const isFile = stat?.isFile();
    if (!snapshot.sources.has(sourcePath) || !isFile) {
      // Directory notifications reconcile descendants without relying on child events.
      for (const existing of sources.keys()) {
        if (existing.startsWith(sourcePath + path.sep)) {
          sources.delete(existing);
        }
      }
    }
    const files = isFile
      ? [sourcePath]
      : stat?.isDirectory()
        ? walkFiles(sourcePath)
        : [];
    for (const filePath of files) {
      sources.set(filePath, createSourceEntry(snapshot, filePath, kind));
    }
  }
  return indexSources(snapshot, sources);
}

export function assertNoOutputPathConflicts(scan: TadaProjectScan): string[] {
  return [...scan.outputProducers]
    .filter(([, producers]) => producers.size > 1)
    .map(([output]) => output)
    .sort();
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
  processedExts: ReadonlySet<string>,
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

export function getSourceOutputPaths({
  contentDir,
  filePath,
  processedExts,
  buildContent,
}: {
  contentDir: string;
  filePath: string;
  processedExts: ReadonlySet<string>;
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
  processedExts: ReadonlySet<string>;
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

  for (const output of getSourceOutputPaths({
    contentDir: rootDir,
    filePath,
    processedExts,
    buildContent,
  })) {
    if (output.endsWith('.html')) {
      addGeneratedRouteAliases(targets, `/${output}`);
    } else {
      targets.add(normalizeOutputPath(`/${output}`));
    }
  }
  return targets;
}
