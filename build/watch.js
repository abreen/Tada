#!/usr/bin/env bun
const fs = require('fs');
const { fork } = require('child_process');
const path = require('path');
const chokidar = require('chokidar');
const WebSocket = require('ws');
const { B } = require('./colors');
const { makeLogger, printFlair } = require('./log');
const { getDevSiteVariables } = require('./site-variables');
const {
  compileTemplates,
  getHtmlTemplatesDir,
  getJsonDataDir,
  JSON_DATA_FILES,
} = require('./templates');
const {
  getContentDir,
  getPublicDir,
  getDistDir,
  getPackageDir,
} = require('./utils/paths');
const { isFeatureEnabled } = require('./features');
const { bundle } = require('./bundle');
const { generateFonts } = require('./generate-fonts');
const { generateFavicons } = require('./generate-favicon');
const { generateManifest } = require('./generate-manifest');
const {
  copyPublicFiles,
  copyContentAssets,
  copyContentFile,
  copyPublicFile,
} = require('./copy');
const { getProcessedExtensions } = require('./utils/file-types');
const { ContentRenderer } = require('./generate-content-assets');
const { WatchPagefindRunner } = require('./pagefind');
const { ContentChangeDetector } = require('./content-watch');

const WEBSOCKET_PORT = 35729;
const DEBOUNCE_MS = 300;

const log = makeLogger(__filename);
const wslog = makeLogger('WebSocket');

// --- WebSocket server (unchanged) ---

let webSocketsReady = false;
let webServerReady = false;
let webServerTimeout;
let serveStarted = false;

let wss = null;
try {
  wss = new WebSocket.Server({ port: WEBSOCKET_PORT });

  wss.on('connection', conn => {
    wslog.debug`WebSocket client connected`;
    conn.on('close', () => {
      wslog.debug`WebSocket client disconnected`;
    });
  });

  wss.on('error', err => {
    wslog.error`WebSocket server error: ${err.message}`;
  });

  wss.on('listening', () => {
    wslog.debug`WebSocket server listening at ws://localhost:${WEBSOCKET_PORT}`;
    webSocketsReady = true;
  });
} catch (err) {
  wslog.error`Failed to start WebSocket server on port ${WEBSOCKET_PORT}: ${err.message}`;
}

function broadcast(msg) {
  if (wss == null || !webSocketsReady) {
    return;
  }
  wslog.debug(`Broadcasting "${msg}" to WebSocket clients`);
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  });
}

// --- Dev server (unchanged) ---

function serve() {
  const child = fork(path.join(__dirname, 'serve.js'), { stdio: 'inherit' });
  child.on('close', code => {
    webServerReady = false;
    log.error`Web server exited with code ${code}`;
    process.exit(2);
  });
  child.on('error', err => {
    webServerReady = false;
    log.error`Web server failed: ${err.message}`;
  });
  child.on('message', msg => {
    if (msg.ready) {
      webServerReady = true;
      clearTimeout(webServerTimeout);
    }
  });

  webServerTimeout = setTimeout(() => {
    if (webServerReady) {
      return;
    }
    log.error`Web server failed to report within 10 seconds, exiting`;
    process.exit(3);
  }, 10000);
}

// --- Path helpers ---

function toContentMarkdownPath(filePath) {
  if (!filePath) {
    return null;
  }
  const ext = path.extname(filePath).toLowerCase();
  if (!['.md', '.markdown'].includes(ext)) {
    return null;
  }

  const normalizedContentDir = path.resolve(contentDir) + path.sep;
  const normalizedFilePath = path.resolve(filePath);
  if (!normalizedFilePath.startsWith(normalizedContentDir)) {
    return null;
  }

  return path
    .relative(contentDir, normalizedFilePath)
    .split(path.sep)
    .join(path.posix.sep);
}

function toPublicRelativePath(filePath) {
  if (!filePath) {
    return null;
  }
  const normalizedPublicDir = path.resolve(publicDir) + path.sep;
  const normalizedFilePath = path.resolve(filePath);
  if (!normalizedFilePath.startsWith(normalizedPublicDir)) {
    return null;
  }
  return path
    .relative(publicDir, normalizedFilePath)
    .split(path.sep)
    .join(path.posix.sep);
}

// --- Watch mode ---

const contentDir = getContentDir();
const publicDir = getPublicDir();
const distDir = getDistDir();
const packageDir = getPackageDir();

let siteVariables = getDevSiteVariables();
let processedExtSet = new Set(
  getProcessedExtensions(Object.keys(siteVariables.codeLanguages || {})),
);
let publicRelPaths = new Set();
let contentAssetRelPaths = new Set();
let contentRenderer;
let changeDetector;
let pagefindRunner;
let assetFiles = [];
let debounceTimer = null;
let pendingChanges = new Set();
let rebuilding = false;

async function initialBuild() {
  fs.mkdirSync(distDir, { recursive: true });

  compileTemplates(siteVariables);
  contentRenderer = new ContentRenderer(siteVariables);
  changeDetector = new ContentChangeDetector(siteVariables);

  if (isFeatureEnabled(siteVariables, 'search')) {
    pagefindRunner = new WatchPagefindRunner(siteVariables);
  }

  await contentRenderer.initHighlighter();

  // Bundle with watch-reload-client as extra entry
  const reloadClientPath = path.resolve(
    packageDir,
    'build/watch-reload-client.js',
  );
  assetFiles = await bundle(siteVariables, {
    mode: 'development',
    extraEntrypoints: [reloadClientPath],
  });

  await generateFonts(distDir);

  if (isFeatureEnabled(siteVariables, 'favicon')) {
    await generateFavicons(siteVariables, distDir);
    generateManifest(siteVariables, distDir);
  }

  publicRelPaths = copyPublicFiles(publicDir, distDir);
  contentAssetRelPaths = copyContentAssets(
    contentDir,
    distDir,
    [...processedExtSet],
    publicRelPaths,
  );

  const result = contentRenderer.processContent({ distDir, assetFiles });

  for (const err of result.errors) {
    log.error`${err.message}`;
  }

  if (result.errors.length === 0) {
    printFlair();

    if (pagefindRunner) {
      pagefindRunner.update(distDir, result.htmlAssetsByPath);
      setImmediate(() => pagefindRunner.run());
    }

    if (!serveStarted) {
      serveStarted = true;
      serve();
    }
  }
}

function classifyChange(filePath) {
  const resolved = path.resolve(filePath);
  const resolvedContentDir = path.resolve(contentDir) + path.sep;
  const resolvedPublicDir = path.resolve(publicDir) + path.sep;
  const resolvedSrcDir = path.resolve(packageDir, 'src') + path.sep;
  const htmlTemplatesDir = path.resolve(getHtmlTemplatesDir()) + path.sep;
  const jsonDataDir = getJsonDataDir();
  const siteConfigPath = path.resolve('site.dev.json');

  if (resolved.startsWith(resolvedContentDir)) {
    return 'content';
  }
  if (resolved.startsWith(resolvedPublicDir)) {
    return 'public';
  }
  if (resolved.startsWith(resolvedSrcDir)) {
    return 'src';
  }
  if (
    resolved.startsWith(htmlTemplatesDir) ||
    JSON_DATA_FILES.some(f => resolved === path.resolve(jsonDataDir, f))
  ) {
    return 'templates';
  }
  if (resolved === siteConfigPath) {
    return 'config';
  }
  return null;
}

async function rebuild() {
  if (rebuilding) {
    return;
  }
  rebuilding = true;

  const changes = new Set(pendingChanges);
  pendingChanges.clear();

  broadcast('rebuilding');

  // Classify changes
  const categories = new Set();
  for (const filePath of changes) {
    const category = classifyChange(filePath);
    if (category) {
      categories.add(category);
    }
  }

  try {
    // Site config changed, full restart
    if (categories.has('config')) {
      log.event`Site config changed, restarting`;
      siteVariables = getDevSiteVariables();
      processedExtSet = new Set(
        getProcessedExtensions(Object.keys(siteVariables.codeLanguages || {})),
      );
      contentRenderer = new ContentRenderer(siteVariables);
      changeDetector = new ContentChangeDetector(siteVariables);
      if (isFeatureEnabled(siteVariables, 'search')) {
        pagefindRunner = new WatchPagefindRunner(siteVariables);
      }
      compileTemplates(siteVariables);
      await contentRenderer.initHighlighter();

      const reloadClientPath = path.resolve(
        packageDir,
        'build/watch-reload-client.js',
      );
      assetFiles = await bundle(siteVariables, {
        mode: 'development',
        extraEntrypoints: [reloadClientPath],
      });

      const result = contentRenderer.processContent({ distDir, assetFiles });
      for (const err of result.errors) {
        log.error`${err.message}`;
      }
      if (result.errors.length === 0) {
        printFlair(siteVariables);
        broadcast('reload');
        if (pagefindRunner) {
          pagefindRunner.update(distDir, result.htmlAssetsByPath);
          setImmediate(() => pagefindRunner.run());
        }
      }
      rebuilding = false;
      return;
    }

    // Source changed, re-bundle, then re-render all content
    if (categories.has('src')) {
      const reloadClientPath = path.resolve(
        packageDir,
        'build/watch-reload-client.js',
      );
      assetFiles = await bundle(siteVariables, {
        mode: 'development',
        extraEntrypoints: [reloadClientPath],
      });
      // Force full content re-render since asset filenames may have changed
      const result = contentRenderer.processContent({ distDir, assetFiles });
      for (const err of result.errors) {
        log.error`${err.message}`;
      }
      if (result.errors.length === 0) {
        printFlair(siteVariables);
        broadcast('reload');
        if (pagefindRunner) {
          pagefindRunner.update(distDir, result.htmlAssetsByPath);
          setImmediate(() => pagefindRunner.run());
        }
      }
      rebuilding = false;
      return;
    }

    // Templates/data changed, recompile templates, re-render all content
    if (categories.has('templates')) {
      const detection = changeDetector.detectChanges(changes);
      if (detection.templateError) {
        log.error`Template error: ${detection.templateError.message}`;
        rebuilding = false;
        return;
      }
    }

    // Public file changed, copy just that file
    if (
      categories.has('public') &&
      !categories.has('content') &&
      !categories.has('templates')
    ) {
      for (const filePath of changes) {
        if (classifyChange(filePath) === 'public') {
          const absPath = path.resolve(filePath);
          if (fs.existsSync(absPath)) {
            copyPublicFile(publicDir, distDir, absPath, contentAssetRelPaths);
            const rel = path
              .relative(publicDir, absPath)
              .split(path.sep)
              .join(path.posix.sep);
            publicRelPaths.add(rel);
          }
        }
      }
      printFlair(siteVariables);
      broadcast('reload');
      rebuilding = false;
      return;
    }

    // Content and/or templates changed, incremental rebuild
    const detection = changeDetector.detectChanges(changes);
    if (detection.templateError) {
      log.error`Template error: ${detection.templateError.message}`;
      rebuilding = false;
      return;
    }

    if (detection.needsRestart) {
      log.event`Content structure changed, full rebuild`;
      contentRenderer = new ContentRenderer(siteVariables);
      await contentRenderer.initHighlighter();
    }

    // Log changed content files
    for (const filePath of changes) {
      const markdownPath = toContentMarkdownPath(filePath);
      if (markdownPath) {
        log.event`${B`${markdownPath}`} changed, rebuilding`;
      } else {
        const pubPath = toPublicRelativePath(filePath);
        if (pubPath) {
          log.event`${B`public/${pubPath}`} changed`;
        }
      }
    }

    // Copy any changed public files too
    if (categories.has('public')) {
      for (const filePath of changes) {
        if (classifyChange(filePath) === 'public') {
          const absPath = path.resolve(filePath);
          if (fs.existsSync(absPath)) {
            copyPublicFile(publicDir, distDir, absPath, contentAssetRelPaths);
            const rel = path
              .relative(publicDir, absPath)
              .split(path.sep)
              .join(path.posix.sep);
            publicRelPaths.add(rel);
          }
        }
      }
    }

    // Copy any changed non-processed content files (images, PDFs, etc.)
    if (categories.has('content')) {
      for (const filePath of changes) {
        if (classifyChange(filePath) !== 'content') {
          continue;
        }
        const absPath = path.resolve(filePath);
        const ext = path.extname(absPath).slice(1).toLowerCase();
        if (!processedExtSet.has(ext) && fs.existsSync(absPath)) {
          copyContentFile(contentDir, distDir, absPath, publicRelPaths);
          const rel = path
            .relative(contentDir, absPath)
            .split(path.sep)
            .join(path.posix.sep);
          contentAssetRelPaths.add(rel);
        }
      }
    }

    const watchState = detection.needsRestart
      ? undefined
      : {
          changedContentFiles: detection.changedContentFiles,
          templatesChanged: detection.templatesChanged,
        };

    const result = contentRenderer.processContent({
      distDir,
      assetFiles,
      watchState,
    });

    for (const err of result.errors) {
      log.error`${err.message}`;
    }

    if (result.errors.length === 0) {
      printFlair(siteVariables);
      broadcast('reload');

      if (pagefindRunner) {
        pagefindRunner.update(distDir, result.htmlAssetsByPath);
        setImmediate(() => pagefindRunner.run());
      }
    }
  } catch (err) {
    log.error`Build failed: ${err.message}`;
  } finally {
    rebuilding = false;

    // If more changes accumulated during rebuild, schedule another
    if (pendingChanges.size > 0) {
      scheduleRebuild();
    }
  }
}

function scheduleRebuild() {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }
  debounceTimer = setTimeout(rebuild, DEBOUNCE_MS);
}

function onFileChange(filePath) {
  pendingChanges.add(filePath);
  scheduleRebuild();
}

// --- Start ---

initialBuild()
  .then(() => {
    // Watch content, public, src, templates, data files, site config
    const watchPaths = [contentDir, publicDir];

    // Watch package src/ and templates/ for Tada development
    const srcDir = path.resolve(packageDir, 'src');
    const templatesDir = getHtmlTemplatesDir();
    if (fs.existsSync(srcDir)) {
      watchPaths.push(srcDir);
    }
    if (fs.existsSync(templatesDir)) {
      watchPaths.push(templatesDir);
    }

    // Watch data files
    const jsonDataDir = getJsonDataDir();
    for (const dataFile of JSON_DATA_FILES) {
      const dataPath = path.join(jsonDataDir, dataFile);
      if (fs.existsSync(dataPath)) {
        watchPaths.push(dataPath);
      }
    }

    // Watch site config
    const siteConfigPath = path.resolve('site.dev.json');
    if (fs.existsSync(siteConfigPath)) {
      watchPaths.push(siteConfigPath);
    }

    const watcher = chokidar.watch(watchPaths, {
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 100 },
    });

    watcher.on('change', onFileChange);
    watcher.on('add', onFileChange);
    watcher.on('unlink', onFileChange);

    log.info`Watching for changes...`;
  })
  .catch(err => {
    log.error`Initial build failed: ${err.message}`;
    process.exit(1);
  });
