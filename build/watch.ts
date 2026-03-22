#!/usr/bin/env bun
import fs from 'fs';
import { fork } from 'child_process';
import path from 'path';
import chokidar from 'chokidar';
import WebSocket, { WebSocketServer } from 'ws';
import type { SiteVariables, WatchState } from './types';
import { B } from './colors';
import { makeLogger, printFlair } from './log';
import { getDevSiteVariables } from './site-variables';
import {
  compileTemplates,
  getHtmlTemplatesDir,
  getJsonDataDir,
  JSON_DATA_FILES,
} from './templates';
import {
  getContentDir,
  getPublicDir,
  getDistDir,
  getPackageDir,
} from './utils/paths';
import { isFeatureEnabled } from './features';
import { bundle } from './bundle';
import { copyFonts } from './generate-fonts';
import { generateFavicons } from './generate-favicon';
import { generateManifest } from './generate-manifest';
import {
  copyPublicFiles,
  copyContentAssets,
  copyContentFile,
  copyPublicFile,
} from './copy';
import { getProcessedExtensions } from './utils/file-types';
import { ContentRenderer } from './generate-content-assets';
import { WatchPagefindRunner } from './pagefind';
import { ContentChangeDetector } from './content-watch';

function getArg(name: string): number | null {
  const idx = process.argv.indexOf(name);
  if (idx !== -1 && process.argv[idx + 1]) {
    const val = parseInt(process.argv[idx + 1], 10);
    if (val > 0 && val < 65536) {
      return val;
    }
  }
  return null;
}

const httpPort = getArg('--port');
const WEBSOCKET_PORT = getArg('--ws-port') ?? 35729;
const DEBOUNCE_MS = 300;
const RELOAD_CLIENT_PATH = path.resolve(
  getPackageDir(),
  'build/watch-reload-client.ts',
);

// Bundle the reload client separately to work around a Bun bundler bug where
// side-effect-only JS entrypoints are tree-shaken when bundled alongside SCSS
// entrypoints processed by a plugin.
async function bundleReloadClient(): Promise<string[]> {
  const result = await Bun.build({
    entrypoints: [RELOAD_CLIENT_PATH],
    outdir: getDistDir(),
    naming: '[name].bundle.[ext]',
    sourcemap: 'inline',
    define: { __WEBSOCKET_PORT__: String(WEBSOCKET_PORT) },
  });
  return result.outputs.map(output =>
    path
      .relative(getDistDir(), output.path)
      .split(path.sep)
      .join(path.posix.sep),
  );
}

type ChangeCategory = 'content' | 'public' | 'src' | 'templates' | 'config';

const log = makeLogger(__filename);
const wslog = makeLogger('WebSocket');

// --- WebSocket server (unchanged) ---

let webSocketsReady = false;
let webServerReady = false;
let webServerTimeout: ReturnType<typeof setTimeout> | undefined;
let serveStarted = false;

let wss: WebSocketServer | null = null;
try {
  wss = new WebSocketServer({ port: WEBSOCKET_PORT });

  wss.on('connection', (conn: WebSocket) => {
    wslog.debug`WebSocket client connected`;
    conn.on('close', () => {
      wslog.debug`WebSocket client disconnected`;
    });
  });

  wss.on('error', (err: Error) => {
    wslog.error`WebSocket server error: ${err.message}`;
  });

  wss.on('listening', () => {
    wslog.debug`WebSocket server listening at ws://localhost:${WEBSOCKET_PORT}`;
    webSocketsReady = true;
  });
} catch (err) {
  wslog.error`Failed to start WebSocket server on port ${WEBSOCKET_PORT}: ${(err as Error).message}`;
}

function broadcast(msg: string): void {
  if (wss == null || !webSocketsReady) {
    return;
  }
  wslog.debug`Broadcasting "${msg}" to WebSocket clients`;
  wss.clients.forEach((client: WebSocket) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  });
}

// --- Dev server ---

function serve(): void {
  const serveArgs = httpPort != null ? ['--port', String(httpPort)] : [];
  const child = fork(path.join(__dirname, 'serve.js'), serveArgs, {
    stdio: 'inherit',
  });
  child.on('close', (code: number | null) => {
    webServerReady = false;
    log.error`Web server exited with code ${code}`;
    process.exit(2);
  });
  child.on('error', (err: Error) => {
    webServerReady = false;
    log.error`Web server failed: ${err.message}`;
  });
  child.on('message', (msg: Record<string, unknown>) => {
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

function toContentMarkdownPath(filePath: string): string | null {
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

function toPublicRelativePath(filePath: string): string | null {
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

const contentDir: string = getContentDir();
const publicDir: string = getPublicDir();
const distDir: string = getDistDir();
const packageDir: string = getPackageDir();

let siteVariables: SiteVariables = getDevSiteVariables();
let processedExtSet = new Set<string>(
  getProcessedExtensions(Object.keys(siteVariables.codeLanguages || {})),
);
let publicRelPaths: Set<string> = new Set();
let contentAssetRelPaths: Set<string> = new Set();
let contentRenderer: ContentRenderer;
let changeDetector: ContentChangeDetector;
let pagefindRunner: WatchPagefindRunner | undefined;
let assetFiles: string[] = [];
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
const pendingChanges = new Set<string>();
let rebuilding = false;

async function initialBuild(): Promise<void> {
  fs.mkdirSync(distDir, { recursive: true });

  compileTemplates(siteVariables);
  contentRenderer = new ContentRenderer(siteVariables);
  changeDetector = new ContentChangeDetector(siteVariables);

  if (isFeatureEnabled(siteVariables, 'search')) {
    pagefindRunner = new WatchPagefindRunner(siteVariables);
  }

  await contentRenderer.initHighlighter();

  assetFiles = [
    ...(await bundle(siteVariables, { mode: 'development' })),
    ...(await bundleReloadClient()),
  ];

  copyFonts(distDir);

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
      setImmediate(() => pagefindRunner!.run());
    }

    if (!serveStarted) {
      serveStarted = true;
      serve();
    }
  }
}

function classifyChange(filePath: string): ChangeCategory | null {
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

async function rebuild(): Promise<void> {
  if (rebuilding) {
    return;
  }
  rebuilding = true;

  const changes = new Set(pendingChanges);
  pendingChanges.clear();

  broadcast('rebuilding');

  // Classify changes
  const categories = new Set<ChangeCategory>();
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

      assetFiles = [
        ...(await bundle(siteVariables, { mode: 'development' })),
        ...(await bundleReloadClient()),
      ];

      copyFonts(distDir);

      if (isFeatureEnabled(siteVariables, 'favicon')) {
        await generateFavicons(siteVariables, distDir);
        generateManifest(siteVariables, distDir);
      }

      const result = contentRenderer.processContent({ distDir, assetFiles });
      for (const err of result.errors) {
        log.error`${err.message}`;
      }
      if (result.errors.length === 0) {
        printFlair();
        if (!serveStarted) {
          serveStarted = true;
          serve();
        }
        broadcast('reload');
        if (pagefindRunner) {
          pagefindRunner.update(distDir, result.htmlAssetsByPath);
          setImmediate(() => pagefindRunner!.run());
        }
      }
      rebuilding = false;
      return;
    }

    // Source changed, re-bundle, then re-render all content
    if (categories.has('src')) {
      assetFiles = [
        ...(await bundle(siteVariables, { mode: 'development' })),
        ...(await bundleReloadClient()),
      ];
      // Force full content re-render since asset filenames may have changed
      const result = contentRenderer.processContent({ distDir, assetFiles });
      for (const err of result.errors) {
        log.error`${err.message}`;
      }
      if (result.errors.length === 0) {
        printFlair();
        if (!serveStarted) {
          serveStarted = true;
          serve();
        }
        broadcast('reload');
        if (pagefindRunner) {
          pagefindRunner.update(distDir, result.htmlAssetsByPath);
          setImmediate(() => pagefindRunner!.run());
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
      printFlair();
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

    const watchState: WatchState | undefined = detection.needsRestart
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
      printFlair();
      if (!serveStarted) {
        serveStarted = true;
        serve();
      }
      broadcast('reload');

      if (pagefindRunner) {
        pagefindRunner.update(distDir, result.htmlAssetsByPath);
        setImmediate(() => pagefindRunner!.run());
      }
    }
  } catch (err) {
    log.error`Build failed: ${(err as Error).message}`;
  } finally {
    rebuilding = false;

    // If more changes accumulated during rebuild, schedule another
    if (pendingChanges.size > 0) {
      scheduleRebuild();
    }
  }
}

function scheduleRebuild(): void {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }
  debounceTimer = setTimeout(rebuild, DEBOUNCE_MS);
}

function onFileChange(filePath: string): void {
  pendingChanges.add(filePath);
  scheduleRebuild();
}

// --- Start ---

initialBuild()
  .catch(err => {
    log.error`Initial build failed: ${(err as Error).message}`;
  })
  .finally(() => {
    // Watch content, public, src, templates, data files, site config
    const watchPaths: string[] = [contentDir, publicDir];

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

    watcher.on('ready', () => {
      broadcast('ready');
      log.info`Watching for changes...`;
    });
  });
