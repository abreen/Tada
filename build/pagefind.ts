import fs from 'fs';
import path from 'path';
import { makeLogger } from './log';
import { collectReachableSiteAssets } from './reachability';
import { normalizeOutputPath, SEARCH_INDEX_DIR } from './utils/paths';
import { isFeatureEnabled } from './features';
import type { SiteVariables } from './types';
import type { TadaProjectScan } from './source-model';
import { assertMutoolAvailable, extractPdfPages } from './pdf-text';
import type { HtmlOutputAnalysis } from './types';

const log = makeLogger(import.meta.url);
const PAGEFIND_VERBOSE = process.env.TADA_LOG_LEVEL === 'debug';

/**
 * Output path prefixes a full write leaves alone: the search index, which is
 * written after the build.
 */
export function getKeptOutputPrefixes(siteVariables: SiteVariables): string[] {
  return isFeatureEnabled(siteVariables, 'search')
    ? [`${SEARCH_INDEX_DIR}/`]
    : [];
}

type PagefindModule = typeof import('pagefind');
type PagefindIndex = Awaited<
  ReturnType<PagefindModule['createIndex']>
>['index'];

let pagefindModulePromise: Promise<PagefindModule> | null = null;

function getPagefind(): Promise<PagefindModule> {
  if (!pagefindModulePromise) {
    pagefindModulePromise = import('pagefind');
  }
  return pagefindModulePromise;
}

function formatPagefindErrors(
  step: string,
  errors: string[] | undefined,
): string | null {
  if (!errors?.length) {
    return null;
  }
  return `${step} failed: ${errors.join(' | ')}`;
}

async function addHtmlFile(
  index: NonNullable<PagefindIndex>,
  htmlFile: { sourcePath: string; content: string },
): Promise<void> {
  const { errors: addErrors } = await index.addHTMLFile(htmlFile);
  const addError = formatPagefindErrors(
    `index.addHTMLFile(${htmlFile.sourcePath})`,
    addErrors,
  );
  if (addError) {
    throw new Error(addError);
  }
}

async function addPdfRecord(
  index: NonNullable<PagefindIndex>,
  record: {
    url: string;
    content: string;
    language: string;
    meta: Record<string, string>;
  },
  sourcePath: string,
): Promise<void> {
  const { errors: addErrors } = await index.addCustomRecord(record);
  const addError = formatPagefindErrors(
    `index.addCustomRecord(${sourcePath})`,
    addErrors,
  );
  if (addError) {
    throw new Error(addError);
  }
}

/** PDFs copied from `content/`, keyed by their root-relative output path */
export function getPdfSources(scan: TadaProjectScan): Map<string, string> {
  const pdfSources = new Map<string, string>();
  for (const [filePath, entry] of scan.sources) {
    if (
      entry.renderKind !== 'content-copy' ||
      path.extname(filePath).toLowerCase() !== '.pdf'
    ) {
      continue;
    }
    for (const outputPath of entry.outputs) {
      pdfSources.set(normalizeOutputPath(`/${outputPath}`), filePath);
    }
  }
  return pdfSources;
}

interface IndexTargets {
  reachableHtmlPaths: string[];
  reachablePdfPaths: string[];
}

function collectIndexTargets(
  htmlAnalysisByPath: Map<string, HtmlOutputAnalysis>,
  pdfSourceByOutputPath: Map<string, string>,
): IndexTargets {
  if (htmlAnalysisByPath.size === 0) {
    return { reachableHtmlPaths: [], reachablePdfPaths: [] };
  }

  const { reachableHtmlPaths, reachableAssetTargets } =
    collectReachableSiteAssets({
      htmlAnalysisByPath,
      knownAssetTargets: new Set(pdfSourceByOutputPath.keys()),
      rootPath: 'index.html',
    });

  return {
    reachableHtmlPaths,
    reachablePdfPaths: reachableAssetTargets.filter(target =>
      pdfSourceByOutputPath.has(target),
    ),
  };
}

interface BuildIndexOptions {
  distPath: string;
  htmlAssetsByPath: Map<string, string>;
  reachableHtmlPaths: string[];
  reachablePdfPaths: string[];
  pdfSourceByOutputPath: Map<string, string>;
  loadPagefind?: () => Promise<PagefindModule>;
  checkMutool?: () => Promise<void>;
  extractPages?: typeof extractPdfPages;
  clearOutputDir?: (dir: string) => void;
}

function removeSearchIndex(dir: string): void {
  fs.rmSync(dir, {
    recursive: true,
    force: true,
    maxRetries: 4,
    retryDelay: 50,
  });
}

async function buildIndex({
  distPath,
  htmlAssetsByPath,
  reachableHtmlPaths,
  reachablePdfPaths,
  pdfSourceByOutputPath,
  loadPagefind = getPagefind,
  checkMutool = assertMutoolAvailable,
  extractPages = extractPdfPages,
  clearOutputDir = removeSearchIndex,
}: BuildIndexOptions): Promise<void> {
  const pagefind = await loadPagefind();
  const { index, errors: createErrors } = await pagefind.createIndex({
    keepIndexUrl: true,
    verbose: PAGEFIND_VERBOSE,
  });
  const createError = formatPagefindErrors(
    'pagefind.createIndex()',
    createErrors,
  );
  if (createError) {
    throw new Error(createError);
  }
  if (!index) {
    throw new Error('pagefind.createIndex() did not return an index');
  }

  try {
    for (const sourcePath of reachableHtmlPaths) {
      await addHtmlFile(index, {
        sourcePath,
        content: htmlAssetsByPath.get(sourcePath)!,
      });
    }

    let mutoolAvailable = true;
    if (reachablePdfPaths.length > 0) {
      try {
        await checkMutool();
      } catch {
        mutoolAvailable = false;
        log.warn`mutool was not found; search results will not include PDFs`;
      }
    }

    for (const pdfPath of mutoolAvailable ? reachablePdfPaths : []) {
      const sourceFilePath = pdfSourceByOutputPath.get(pdfPath);
      if (!sourceFilePath) {
        continue;
      }

      const { pages, hasExtractedText } = await extractPages(sourceFilePath);
      const title = path.posix.basename(pdfPath);

      if (!hasExtractedText) {
        await addPdfRecord(
          index,
          { url: pdfPath, content: title, language: 'en', meta: { title } },
          pdfPath,
        );
        continue;
      }

      for (const page of pages) {
        const content =
          page.pageNumber === 1 ? `${title} ${page.content}` : page.content;
        await addPdfRecord(
          index,
          {
            url: `${pdfPath}#page=${page.pageNumber}`,
            content,
            language: 'en',
            meta: { title, page: String(page.pageNumber) },
          },
          `${pdfPath}#page=${page.pageNumber}`,
        );
      }
    }

    // Start from an empty directory so files from earlier indexes don't pile up.
    const outputPath = path.join(distPath, SEARCH_INDEX_DIR);
    clearOutputDir(outputPath);
    const { errors: writeErrors } = await index.writeFiles({ outputPath });
    const writeError = formatPagefindErrors('index.writeFiles()', writeErrors);
    if (writeError) {
      throw new Error(writeError);
    }
  } finally {
    await index.deleteIndex().catch(() => null);
  }
}

interface RunPagefindOptions {
  distPath: string;
  htmlAssetsByPath: Map<string, string>;
  htmlAnalysisByPath: Map<string, HtmlOutputAnalysis>;
  pdfSourceByOutputPath: Map<string, string>;
}

export async function runPagefind({
  distPath,
  htmlAssetsByPath,
  htmlAnalysisByPath,
  pdfSourceByOutputPath,
}: RunPagefindOptions): Promise<void> {
  const start = Date.now();

  log.debug`Finding reachable pages for search index`;
  const { reachableHtmlPaths, reachablePdfPaths } = collectIndexTargets(
    htmlAnalysisByPath,
    pdfSourceByOutputPath,
  );

  let noun = reachableHtmlPaths.length === 1 ? 'page' : 'pages';
  let message = `Building search index for ${reachableHtmlPaths.length} ${noun}`;
  if (reachablePdfPaths.length > 0) {
    noun = reachablePdfPaths.length === 1 ? 'PDF' : 'PDFs';
    message += ` and ${reachablePdfPaths.length} ${noun}`;
  }
  log.info`${message}`;

  await buildIndex({
    distPath,
    htmlAssetsByPath,
    reachableHtmlPaths,
    reachablePdfPaths,
    pdfSourceByOutputPath,
  });

  const finishedAt = Date.now();
  log.debug`Search index built in ${finishedAt - start}ms`;
}

export class WatchPagefindRunner {
  private watchRunInProgress: boolean;
  private watchRunQueued: boolean;
  private distPath: string | null;
  private htmlCacheByAssetPath: Map<string, string>;
  private htmlAnalysisByPath: Map<string, HtmlOutputAnalysis>;
  private pdfSourceByOutputPath: Map<string, string>;

  constructor() {
    this.watchRunInProgress = false;
    this.watchRunQueued = false;
    this.distPath = null;
    this.htmlCacheByAssetPath = new Map();
    this.htmlAnalysisByPath = new Map();
    this.pdfSourceByOutputPath = new Map();
  }

  update(
    distPath: string,
    htmlAssetsByPath: Map<string, string>,
    htmlAnalysisByPath: Map<string, HtmlOutputAnalysis>,
    pdfSourceByOutputPath: Map<string, string>,
  ): void {
    this.distPath = distPath;
    this.htmlCacheByAssetPath = htmlAssetsByPath;
    this.htmlAnalysisByPath = htmlAnalysisByPath;
    this.pdfSourceByOutputPath = pdfSourceByOutputPath;
  }

  run(): void {
    if (this.watchRunInProgress) {
      this.watchRunQueued = true;
      log.debug`Indexing is still running in the background; queueing a rerun`;
      return;
    }

    this.watchRunInProgress = true;
    this.watchRunQueued = false;
    const distPath = this.distPath!;
    const htmlAssetsByPath = new Map(this.htmlCacheByAssetPath);
    const htmlAnalysisByPath = new Map(this.htmlAnalysisByPath);
    const pdfSourceByOutputPath = this.pdfSourceByOutputPath;
    const start = Date.now();

    log.debug`Preparing search index background snapshot`;

    let reachableHtmlPaths: string[];
    let reachablePdfPaths: string[];
    try {
      ({ reachableHtmlPaths, reachablePdfPaths } = collectIndexTargets(
        htmlAnalysisByPath,
        pdfSourceByOutputPath,
      ));
    } catch (err) {
      this.watchRunInProgress = false;
      log.warn`Pagefind failed: ${(err as Error).message}`;
      if (this.watchRunQueued) {
        this.run();
      }
      return;
    }

    log.debug`Building search index in background`;
    buildIndex({
      distPath,
      htmlAssetsByPath,
      reachableHtmlPaths,
      reachablePdfPaths,
      pdfSourceByOutputPath,
    })
      .then(() => {
        const finishedAt = Date.now();
        log.info`Search index ready after ${finishedAt - start}ms`;
      })
      .catch(err => {
        const failedAt = Date.now();
        log.warn`Search index failed after ${failedAt - start}ms: ${err.message}`;
      })
      .finally(() => {
        this.watchRunInProgress = false;
        if (this.watchRunQueued) {
          log.debug`Starting queued Pagefind background rerun`;
          this.run();
        }
      });
  }
}

export { buildIndex, collectIndexTargets };
