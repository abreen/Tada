import fs from 'fs';
import path from 'path';
import { parseFrontMatterAndContent } from './utils/front-matter';
import { collectScriptEntries } from './author-scripts';
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
  | 'public-copy'
  | 'document-index';

/** Render kinds that produce a page */
export const PAGE_RENDER_KINDS: ReadonlySet<TadaSourceRenderKind> = new Set([
  'plain-text-page',
  'code-page',
  'literate-java',
]);

export interface SourceEntry {
  readonly kind: 'content' | 'public';
  readonly renderKind: TadaSourceRenderKind;
  readonly outputs: ReadonlySet<string>;
  readonly targets: ReadonlySet<string>;
  /** A page's front matter `scripts` value, as written */
  readonly scripts?: unknown;
}

export interface TadaProjectScan {
  readonly contentDir: string;
  readonly publicDir: string;
  readonly distDir: string;
  readonly processedExts: ReadonlySet<string>;
  readonly sources: ReadonlyMap<string, SourceEntry>;
  readonly outputProducers: ReadonlyMap<string, ReadonlySet<string>>;
  readonly codePageSourceTargets: ReadonlySet<string>;
  readonly generatedPageTargets: ReadonlySet<string>;
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
    if (pagesOnly && !PAGE_RENDER_KINDS.has(entry.renderKind)) {
      continue;
    }
    yield filePath;
  }
}

const DOCUMENT_INDEX_FILE_NAMES: ReadonlySet<string> = new Set([
  'index.yml',
  'index.yaml',
]);

/** Whether a content file defines a document index rather than a page */
export function isDocumentIndexFile(filePath: string): boolean {
  return DOCUMENT_INDEX_FILE_NAMES.has(path.basename(filePath));
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
  if (isDocumentIndexFile(filePath)) {
    return 'document-index';
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
  // Read by the build, not published
  if (renderKind === 'document-index') {
    return { kind, renderKind, outputs: new Set(), targets: new Set() };
  }
  const rootDir = kind === 'content' ? scan.contentDir : scan.publicDir;
  const scripts =
    renderKind === 'plain-text-page' || renderKind === 'literate-java'
      ? readFrontMatterSummary(filePath).scripts
      : undefined;
  return {
    kind,
    renderKind,
    ...(scripts === undefined ? {} : { scripts }),
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
  const generatedPageTargets = new Set<string>();
  const codePageSourceTargets = new Set<string>();
  const validTargets = new Set<string>();
  const literateJavaOutputPaths = new Set<string>();
  for (const [filePath, entry] of sources) {
    for (const output of entry.outputs) {
      if (!outputProducers.has(output)) {
        outputProducers.set(output, new Set());
      }
      outputProducers.get(output)!.add(filePath);
    }
    if (PAGE_RENDER_KINDS.has(entry.renderKind)) {
      for (const output of entry.outputs) {
        if (output.endsWith('.html')) {
          addGeneratedRouteAliases(generatedPageTargets, `/${output}`);
        }
      }
    }
    for (const target of entry.targets) {
      validTargets.add(target);
    }
    if (entry.renderKind === 'code-page') {
      codePageSourceTargets.add(
        normalizeOutputPath(
          `/${toPosix(path.relative(roots.contentDir, filePath))}`,
        ),
      );
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
    generatedPageTargets,
    codePageSourceTargets,
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

/** Every well-formed script path the site config or a page lists */
export function getScriptEntries(
  scan: TadaProjectScan,
  siteVariables: SiteVariables,
): string[] {
  return collectScriptEntries(
    siteVariables.scripts,
    [...scan.sources.values()].map(entry => entry.scripts),
  );
}

export function assertNoOutputPathConflicts(scan: TadaProjectScan): string[] {
  return [...scan.outputProducers]
    .filter(([, producers]) => producers.size > 1)
    .map(([output]) => output)
    .sort();
}

interface FrontMatterSummary {
  skip: boolean;
  scripts?: unknown;
}

// Front matter fields the scan needs, reused while a file's size and
// modification time are unchanged, so watch rescans read only edited pages.
const frontMatterCache = new Map<
  string,
  { size: number; mtimeMs: number; summary: FrontMatterSummary }
>();

function readFrontMatterSummary(filePath: string): FrontMatterSummary {
  const ext = path.extname(filePath).toLowerCase();
  if (!(extensionIsMarkdown(ext) || ext === '.html')) {
    return { skip: false };
  }

  const { size, mtimeMs } = fs.statSync(filePath);
  const cached = frontMatterCache.get(filePath);
  if (cached && cached.size === size && cached.mtimeMs === mtimeMs) {
    return cached.summary;
  }

  const raw = fs.readFileSync(filePath, 'utf-8');
  let summary: FrontMatterSummary = { skip: false };
  try {
    const { pageVariables } = parseFrontMatterAndContent(raw, ext);
    summary = {
      skip: pageVariables?.skip === true,
      scripts: pageVariables?.scripts,
    };
  } catch {
    // Not skipped: rendering the page reports the error for this file.
  }
  frontMatterCache.set(filePath, { size, mtimeMs, summary });
  return summary;
}

export function shouldSkipContentFile(filePath: string): boolean {
  return readFrontMatterSummary(filePath).skip;
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
