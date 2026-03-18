const fs = require('fs');
const path = require('path');
const { makeLogger } = require('./log');
const { collectReachableSiteAssets } = require('./reachability');
const ContentWatchPlugin = require('./content-watch-plugin');
const {
  getBuildContentFiles,
  getContentDir,
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

function readAssetContent(outputFileSystem, distPath, sourcePath) {
  const filePath = path.join(distPath, sourcePath);
  return String(outputFileSystem.readFileSync(filePath, 'utf-8'));
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

function getPdfSourceByOutputPath(siteVariables) {
  const contentDir = getContentDir();
  const contentFiles = getBuildContentFiles(
    contentDir,
    Object.keys(siteVariables?.codeLanguages || {}),
  );
  const pdfFiles = contentFiles.filter(
    filePath => path.extname(filePath).toLowerCase() === '.pdf',
  );

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
        await addPdfRecord(
          index,
          {
            url: `${pdfPath}#page=${page.pageNumber}`,
            content: page.content,
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

class PagefindPlugin {
  constructor(siteVariables) {
    this.siteVariables = siteVariables || {};
    this.watchRunInProgress = false;
    this.watchRunQueued = false;
    this.lastDistPath = null;
    this.htmlCacheByAssetPath = new Map();
  }

  getHtmlAssetsByPath(compilation, distPath, outputFileSystem) {
    return new Map(
      compilation
        .getAssets()
        .filter(asset => asset.name.endsWith('.html'))
        .map(asset => [
          asset.name.replace(/\\/g, '/'),
          readAssetContent(
            outputFileSystem,
            distPath,
            asset.name.replace(/\\/g, '/'),
          ),
        ]),
    );
  }

  getIndexTargets(htmlAssetsByPath) {
    return collectIndexTargets(
      htmlAssetsByPath,
      this.siteVariables,
      getPdfSourceByOutputPath(this.siteVariables),
    );
  }

  runWatchIndex() {
    if (this.watchRunInProgress) {
      this.watchRunQueued = true;
      log.info`Indexing is still running in the background; queueing a rerun`;
      return;
    }

    this.watchRunInProgress = true;
    this.watchRunQueued = false;
    const distPath = this.lastDistPath;
    const htmlAssetsByPath = new Map(this.htmlCacheByAssetPath);
    const pdfSourceByOutputPath = getPdfSourceByOutputPath(this.siteVariables);
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
        this.runWatchIndex();
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
        log.info`Background search index ready in ${finishedAt - snapshotReadyAt}ms (${finishedAt - start}ms total)`;
      })
      .catch(err => {
        const failedAt = Date.now();
        log.warn`Search index failed after ${failedAt - snapshotReadyAt}ms of indexing (${failedAt - start}ms total): ${err.message}`;
      })
      .finally(() => {
        this.watchRunInProgress = false;
        if (this.watchRunQueued) {
          log.info`Starting queued Pagefind background rerun`;
          this.runWatchIndex();
        }
      });
  }

  apply(compiler) {
    compiler.hooks.afterEmit.tapAsync(
      'PagefindPlugin',
      (compilation, callback) => {
        const distPath =
          compiler.options?.output?.path ||
          compiler.outputPath ||
          compilation.compiler.outputPath;
        const outputFileSystem =
          compiler.outputFileSystem ||
          compilation.compiler.outputFileSystem ||
          fs;
        const isWatch = !!compiler.watching;

        if (compilation.errors.length > 0) {
          callback();
          return;
        }

        let htmlAssetsByPath;
        try {
          htmlAssetsByPath = this.getHtmlAssetsByPath(
            compilation,
            distPath,
            outputFileSystem,
          );
        } catch (err) {
          compilation.errors.push(err);
          callback(err);
          return;
        }

        if (isWatch) {
          this.lastDistPath = distPath;
          this.htmlCacheByAssetPath = htmlAssetsByPath;
          callback();
          return;
        }

        const pdfSourceByOutputPath = getPdfSourceByOutputPath(
          this.siteVariables,
        );
        const start = Date.now();
        let reachableHtmlPaths;
        let reachablePdfPaths;

        log.info`Finding reachable pages for search index`;
        try {
          ({ reachableHtmlPaths, reachablePdfPaths } = collectIndexTargets(
            htmlAssetsByPath,
            this.siteVariables,
            pdfSourceByOutputPath,
          ));
        } catch (err) {
          compilation.errors.push(err);
          callback(err);
          return;
        }

        const snapshotReadyAt = Date.now();
        log.info`Building search index for ${reachableHtmlPaths.length} page(s) and ${reachablePdfPaths.length} PDF(s) after ${snapshotReadyAt - start}ms of snapshot prep...`;
        buildIndex({
          distPath,
          htmlAssetsByPath,
          reachableHtmlPaths,
          reachablePdfPaths,
          pdfSourceByOutputPath,
        })
          .then(async () => {
            try {
              const pagefind = await getPagefind();
              await pagefind.close();
            } catch (_err) {
              // Best-effort cleanup for non-watch builds.
            }
            const finishedAt = Date.now();
            log.info`Search index built in ${finishedAt - snapshotReadyAt}ms (${finishedAt - start}ms total)`;
            callback();
          })
          .catch(err => {
            const failedAt = Date.now();
            log.error`Search indexing failed after ${failedAt - snapshotReadyAt}ms of indexing (${failedAt - start}ms total): ${err.message}`;
            compilation.errors.push(err);
            callback(err);
          });
      },
    );

    compiler.hooks.done.tap('PagefindPluginWatchRun', stats => {
      if (
        !compiler.watching ||
        stats.hasErrors() ||
        ContentWatchPlugin.needsRestart()
      ) {
        return;
      }

      setImmediate(() => this.runWatchIndex());
    });
  }
}

module.exports = PagefindPlugin;
module.exports.buildIndex = buildIndex;
module.exports.collectIndexTargets = collectIndexTargets;
