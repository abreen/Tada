const path = require('path');
const { makeLogger } = require('./log');
const { collectReachableSiteAssets } = require('./reachability');
const {
  getContentDir,
  getFilesByExtensions,
  normalizeOutputPath,
} = require('./util');
const { assertMutoolAvailable, extractPdfPages } = require('./pdf-text');

const log = makeLogger(__filename);
const PAGEFIND_VERBOSE = process.env.TADA_LOG_LEVEL === 'debug';
const PAGEFIND_OUTPUT_SUBDIR = 'pagefind';

let pagefindModulePromise = null;

function getPagefind() {
  if (!pagefindModulePromise) {
    pagefindModulePromise = import('pagefind');
  }
  return pagefindModulePromise;
}

function formatPagefindErrors(step, errors) {
  if (!errors?.length) {
    return null;
  }
  return `${step} failed: ${errors.join(' | ')}`;
}

async function addHtmlFile(index, htmlFile) {
  const { errors: addErrors } = await index.addHTMLFile(htmlFile);
  const addError = formatPagefindErrors(
    `index.addHTMLFile(${htmlFile.sourcePath})`,
    addErrors,
  );
  if (addError) {
    throw new Error(addError);
  }
}

async function addPdfRecord(index, record, sourcePath) {
  const { errors: addErrors } = await index.addCustomRecord(record);
  const addError = formatPagefindErrors(
    `index.addCustomRecord(${sourcePath})`,
    addErrors,
  );
  if (addError) {
    throw new Error(addError);
  }
}

function getPdfSourceByOutputPath() {
  const contentDir = getContentDir();
  const pdfFiles = getFilesByExtensions(contentDir, ['pdf']);

  return new Map(
    pdfFiles.map(filePath => {
      const relPath = path.relative(contentDir, filePath);
      return [normalizeOutputPath(`/${relPath}`), filePath];
    }),
  );
}

function collectIndexTargets(
  htmlAssetsByPath,
  siteVariables,
  pdfSourceByOutputPath,
) {
  if (htmlAssetsByPath.size === 0) {
    return { reachableHtmlPaths: [], reachablePdfPaths: [] };
  }

  return collectReachableSiteAssets({
    htmlAssetsByPath,
    knownPdfPaths: new Set(pdfSourceByOutputPath.keys()),
    rootPath: 'index.html',
    basePath: siteVariables?.basePath || '/',
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
}) {
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
        content: htmlAssetsByPath.get(sourcePath),
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

    const { errors: writeErrors } = await index.writeFiles({
      outputPath: path.join(distPath, PAGEFIND_OUTPUT_SUBDIR),
    });
    const writeError = formatPagefindErrors('index.writeFiles()', writeErrors);
    if (writeError) {
      throw new Error(writeError);
    }
  } finally {
    await index.deleteIndex().catch(() => null);
  }
}

async function runPagefind({ siteVariables, distPath, htmlAssetsByPath }) {
  const pdfSourceByOutputPath = getPdfSourceByOutputPath();
  const start = Date.now();

  log.debug`Finding reachable pages for search index`;
  const { reachableHtmlPaths, reachablePdfPaths } = collectIndexTargets(
    htmlAssetsByPath,
    siteVariables,
    pdfSourceByOutputPath,
  );

  const snapshotReadyAt = Date.now();

  let noun = reachableHtmlPaths.length === 1 ? 'page' : 'pages';
  let message = `Building search index for ${reachableHtmlPaths.length} ${noun}`;
  if (reachablePdfPaths.length > 0) {
    noun = reachablePdfPaths.length === 1 ? 'PDF' : 'PDFs';
    message += ` and ${reachablePdfPaths.length} ${noun}`;
  }
  log.info(message);

  await buildIndex({
    distPath,
    htmlAssetsByPath,
    reachableHtmlPaths,
    reachablePdfPaths,
    pdfSourceByOutputPath,
  });

  try {
    const pagefind = await getPagefind();
    await pagefind.close();
  } catch (_err) {
    // Best-effort cleanup
  }

  const finishedAt = Date.now();
  log.debug`Search index built in ${finishedAt - snapshotReadyAt}ms (${finishedAt - start}ms total)`;
}

class WatchPagefindRunner {
  constructor(siteVariables) {
    this.siteVariables = siteVariables || {};
    this.watchRunInProgress = false;
    this.watchRunQueued = false;
    this.distPath = null;
    this.htmlCacheByAssetPath = new Map();
  }

  update(distPath, htmlAssetsByPath) {
    this.distPath = distPath;
    this.htmlCacheByAssetPath = htmlAssetsByPath;
  }

  run() {
    if (this.watchRunInProgress) {
      this.watchRunQueued = true;
      log.debug`Indexing is still running in the background; queueing a rerun`;
      return;
    }

    this.watchRunInProgress = true;
    this.watchRunQueued = false;
    const distPath = this.distPath;
    const htmlAssetsByPath = new Map(this.htmlCacheByAssetPath);
    const pdfSourceByOutputPath = getPdfSourceByOutputPath();
    const start = Date.now();

    log.debug`Preparing search index background snapshot`;

    let reachableHtmlPaths;
    let reachablePdfPaths;
    try {
      ({ reachableHtmlPaths, reachablePdfPaths } = collectIndexTargets(
        htmlAssetsByPath,
        this.siteVariables,
        pdfSourceByOutputPath,
      ));
    } catch (err) {
      this.watchRunInProgress = false;
      log.warn`Pagefind failed: ${err.message}`;
      if (this.watchRunQueued) {
        this.run();
      }
      return;
    }

    const snapshotReadyAt = Date.now();
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
        log.debug`Search index ready after ${finishedAt - snapshotReadyAt}ms (${finishedAt - start}ms total)`;
      })
      .catch(err => {
        const failedAt = Date.now();
        log.warn`Search index failed after ${failedAt - snapshotReadyAt}ms of indexing (${failedAt - start}ms total): ${err.message}`;
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

module.exports = {
  runPagefind,
  WatchPagefindRunner,
  buildIndex,
  collectIndexTargets,
};
