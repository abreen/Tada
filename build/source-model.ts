import fs from 'fs';
import path from 'path';
import {
  parseFrontMatter,
  parseFrontMatterAndContent,
  parseFrontMatterYaml,
} from './utils/front-matter';
import { collectScriptEntries } from './author-scripts';
import { getExtensionToShikiLanguage } from './site-variables';
import { substituteFrontMatterValue } from './variables';
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
  toDisplayPath,
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
  /** A page's front matter `title`, after site variable substitution */
  readonly title?: string;
  /**
   * A page's front matter fields that its title rendering reads, as written;
   * absent when the front matter is not valid YAML
   */
  readonly titleFields?: PageTitleFields;
}

export interface PageTitleFields {
  readonly title?: unknown;
  readonly slides?: unknown;
  /**
   * Read by a lenient parse because rendering rejects the front matter, such
   * as an unquoted variable; the page's own render reports why
   */
  readonly invalid?: true;
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
  /** Pages by title, for wikilinks */
  readonly pageTitles: PageTitleIndex;
}

export interface PageTitleIndex {
  /** Each page title mapped to the sorted root-relative URLs of its pages */
  readonly byTitle: ReadonlyMap<string, readonly string[]>;
  /** Pages with a title that cannot be linked, each with the reason */
  readonly unlinkableTitles: readonly string[];
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
  siteVariables: Pick<SiteVariables, 'vars'>,
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
  const summary =
    renderKind === 'plain-text-page' || renderKind === 'literate-java'
      ? readFrontMatterSummary(filePath)
      : undefined;
  const scripts = summary?.scripts;
  const titleFields = summary?.titleFields;
  const title = substituteTitle(titleFields?.title, siteVariables, filePath);
  return {
    kind,
    renderKind,
    ...(scripts === undefined ? {} : { scripts }),
    ...(title === undefined ? {} : { title }),
    ...(titleFields === undefined ? {} : { titleFields }),
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
  const pageTitles = new Map<string, string[]>();
  const unlinkableTitles: string[] = [];
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
          if (entry.title !== undefined) {
            const urls = pageTitles.get(entry.title) ?? [];
            urls.push(`/${output}`);
            pageTitles.set(entry.title, urls);
          } else {
            const reason = getUnlinkableTitleReason(entry.titleFields);
            if (reason) {
              unlinkableTitles.push(`${toDisplayPath(filePath)} (${reason})`);
            }
          }
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
    pageTitles: {
      byTitle: new Map(
        [...pageTitles].map(([title, urls]) => [title, urls.sort()]),
      ),
      unlinkableTitles,
    },
  };
}

/**
 * Scans `content/` and `public/`. Front matter read by an earlier scan is
 * reused unless a file's size or modification time changed, or
 * forgetFrontMatter was called for it.
 */
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
      sources.set(
        filePath,
        createSourceEntry(roots, filePath, kind, siteVariables),
      );
    }
  }
  // Forget deleted files
  for (const filePath of frontMatterCache.keys()) {
    if (!sources.has(filePath)) {
      frontMatterCache.delete(filePath);
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
  /** Absent when the front matter could not be parsed */
  titleFields?: PageTitleFields;
}

/**
 * Why a page that has a title is not in the title index: its title is not text
 * or names an unknown variable. Undefined when it has no title.
 */
function getUnlinkableTitleReason(
  fields: PageTitleFields | undefined,
): string | undefined {
  const title = fields?.title;
  if (title === undefined || title === null || title === '') {
    return undefined;
  }
  if (typeof title === 'string') {
    return 'its title has a variable that cannot be substituted';
  }
  return fields?.invalid
    ? 'its front matter has an error'
    : 'its title is not text; quote it, as in title: "1.10"';
}

/**
 * A page title as rendering will see it, or undefined when there is none or
 * substitution fails (rendering the page reports the error)
 */
function substituteTitle(
  title: unknown,
  siteVariables: Pick<SiteVariables, 'vars'>,
  filePath: string,
): string | undefined {
  if (!title || typeof title !== 'string') {
    return undefined;
  }
  try {
    return substituteFrontMatterValue(title, siteVariables, filePath) as string;
  } catch {
    return undefined;
  }
}

// Front matter fields the scan needs, reused while a file's size and
// modification time are unchanged, so watch rescans read only edited pages.
const frontMatterCache = new Map<
  string,
  { size: number; mtimeMs: number; summary: FrontMatterSummary }
>();

function summarizeFrontMatter(
  pageVariables: Record<string, unknown> | null,
  invalid: boolean,
): FrontMatterSummary {
  return {
    skip: pageVariables?.skip === true,
    scripts: pageVariables?.scripts,
    titleFields: {
      title: pageVariables?.title,
      slides: pageVariables?.slides,
      ...(invalid ? { invalid } : {}),
    },
  };
}

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
    // Parsed as rendering parses it
    const { pageVariables } = parseFrontMatterAndContent(
      raw,
      ext,
      toDisplayPath(filePath),
    );
    summary = summarizeFrontMatter(pageVariables, false);
  } catch {
    // Rendering the page reports the error. Fields the YAML still yields
    // are kept, so the page can be skipped and other pages can link to it.
    try {
      const { frontMatter } = parseFrontMatter(raw, ext);
      summary = summarizeFrontMatter(
        parseFrontMatterYaml(frontMatter ?? ''),
        true,
      );
    } catch {
      // Not skipped, and not linkable
    }
  }
  frontMatterCache.set(filePath, { size, mtimeMs, summary });
  return summary;
}

/** Whether a path is a directory; false if it is gone or under a file */
function isDirectory(filePath: string): boolean {
  try {
    return fs.statSync(filePath).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Makes the next scan read the front matter of the given files, and of the
 * files under the given directories, even if their size and modification
 * time look unchanged
 */
export function forgetFrontMatter(paths: ReadonlySet<string>): void {
  const unmatched = new Set<string>();
  for (const changed of paths) {
    if (!frontMatterCache.delete(changed)) {
      unmatched.add(changed);
    }
  }
  // Deleted files are pruned by the next scan, so only existing directories
  // can still hold files with stale front matter
  for (const changed of unmatched) {
    if (!isDirectory(changed)) {
      unmatched.delete(changed);
    }
  }
  if (unmatched.size === 0) {
    return;
  }
  for (const filePath of frontMatterCache.keys()) {
    for (
      let dir = path.dirname(filePath);
      dir !== path.dirname(dir);
      dir = path.dirname(dir)
    ) {
      if (unmatched.has(dir)) {
        frontMatterCache.delete(filePath);
        break;
      }
    }
  }
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
