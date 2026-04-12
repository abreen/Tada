import fs from 'fs';
import path from 'path';
import chokidar from 'chokidar';
import WebSocket, { WebSocketServer } from 'ws';
import type { SiteVariables, WatchState } from './types';
import { B } from './colors';
import { makeLogger, printFlair } from './log';
import { getDevSiteVariables } from './site-variables';
import { compileTemplates, getJsonDataDir, JSON_DATA_FILES } from './templates';
import {
  getContentDir,
  getPublicDir,
  getDistDir,
  getPackageDir,
  toPosix,
} from './utils/paths';
import { isFeatureEnabled } from './features';
import { bundle } from './bundle';
import { copyFonts } from './generate-fonts';
import { copyKatexAssets } from './generate-katex-assets';
import { generateFavicons } from './generate-favicon';
import { generateWebAppManifest } from './generate-web-app-manifest';
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
import { startServer } from './serve';

export async function runWatch(options: {
  httpPort?: number;
  wsPort?: number;
}): Promise<void> {
  const httpPort = options.httpPort;
  const WEBSOCKET_PORT = options.wsPort ?? 35729;
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
      toPosix(path.relative(getDistDir(), output.path)),
    );
  }

  type ChangeCategory = 'content' | 'public' | 'config';

  const log = makeLogger(import.meta.url);
  const wslog = makeLogger('WebSocket');

  // WebSocket server

  let webSocketsReady = false;
  let watcherReady = false;
  let webServerTimeout: ReturnType<typeof setTimeout> | undefined;
  let serveStarted = false;

  let wss: WebSocketServer | null = null;
  try {
    wss = new WebSocketServer({ port: WEBSOCKET_PORT });

    wss.on('connection', (conn: WebSocket) => {
      wslog.debug`WebSocket client connected`;
      if (watcherReady && conn.readyState === WebSocket.OPEN) {
        if (initialBuildFailed) {
          conn.send('error');
        }
        conn.send('ready');
      }
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

  // Dev server

  function serve(): void {
    startServer({
      port: httpPort,
      distDir,
      onReady: () => {
        clearTimeout(webServerTimeout);
      },
    });

    webServerTimeout = setTimeout(() => {
      log.error`Web server failed to report within 10 seconds, exiting`;
      process.exit(3);
    }, 10000);
  }

  // Path helpers

  function toContentMarkdownPath(filePath: string): string | null {
    const ext = path.extname(filePath).toLowerCase();
    if (!['.md', '.markdown'].includes(ext)) {
      return null;
    }

    const normalizedContentDir = path.resolve(contentDir) + path.sep;
    const normalizedFilePath = path.resolve(filePath);
    if (!normalizedFilePath.startsWith(normalizedContentDir)) {
      return null;
    }

    return toPosix(path.relative(contentDir, normalizedFilePath));
  }

  function toPublicRelativePath(filePath: string): string | null {
    const normalizedPublicDir = path.resolve(publicDir) + path.sep;
    const normalizedFilePath = path.resolve(filePath);
    if (!normalizedFilePath.startsWith(normalizedPublicDir)) {
      return null;
    }
    return toPosix(path.relative(publicDir, normalizedFilePath));
  }

  // Watch mode

  const contentDir: string = getContentDir();
  const publicDir: string = getPublicDir();
  const distDir: string = getDistDir();

  let siteVariables: SiteVariables;
  let processedExtSet = new Set<string>();
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
    siteVariables = getDevSiteVariables();
    processedExtSet = new Set(
      getProcessedExtensions(Object.keys(siteVariables.codeLanguages || {})),
    );
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
    copyKatexAssets(distDir);

    if (isFeatureEnabled(siteVariables, 'favicon')) {
      await generateFavicons(siteVariables, distDir);
      generateWebAppManifest(siteVariables, distDir);
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
    const jsonDataDir = getJsonDataDir();
    const siteConfigPath = path.resolve('site.dev.json');

    if (resolved.startsWith(resolvedContentDir)) {
      return 'content';
    }
    if (resolved.startsWith(resolvedPublicDir)) {
      return 'public';
    }
    if (
      resolved === siteConfigPath ||
      JSON_DATA_FILES.some(f => resolved === path.resolve(jsonDataDir, f))
    ) {
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

    let succeeded = false;

    try {
      // Site config changed, full restart
      if (categories.has('config')) {
        log.event`Site config changed, restarting`;
        siteVariables = getDevSiteVariables();
        processedExtSet = new Set(
          getProcessedExtensions(
            Object.keys(siteVariables.codeLanguages || {}),
          ),
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
        copyKatexAssets(distDir);

        if (isFeatureEnabled(siteVariables, 'favicon')) {
          await generateFavicons(siteVariables, distDir);
          generateWebAppManifest(siteVariables, distDir);
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
          succeeded = true;
        }
        return;
      }

      // Public file changed, copy just that file
      if (categories.has('public') && !categories.has('content')) {
        for (const filePath of changes) {
          if (classifyChange(filePath) === 'public') {
            const absPath = path.resolve(filePath);
            if (fs.existsSync(absPath)) {
              copyPublicFile(publicDir, distDir, absPath, contentAssetRelPaths);
              const rel = toPosix(path.relative(publicDir, absPath));
              publicRelPaths.add(rel);
            }
          }
        }
        printFlair();
        broadcast('reload');
        succeeded = true;
        return;
      }

      // Content changed, incremental rebuild
      const detection = changeDetector.detectChanges(changes);

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
              const rel = toPosix(path.relative(publicDir, absPath));
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
            const rel = toPosix(path.relative(contentDir, absPath));
            contentAssetRelPaths.add(rel);
          }
        }
      }

      const watchState: WatchState | undefined = detection.needsRestart
        ? undefined
        : {
            changedContentFiles: detection.changedContentFiles,
            jsonDataChanged: detection.jsonDataChanged,
            partialsChanged: detection.partialsChanged,
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
        succeeded = true;
      }
    } catch (err) {
      log.error`Build failed: ${(err as Error).message}`;
    } finally {
      if (!succeeded) {
        broadcast('error');
      }
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

  // Start

  let initialBuildFailed = false;

  initialBuild()
    .catch(err => {
      log.error`Initial build failed: ${(err as Error).message}`;
      initialBuildFailed = true;
    })
    .finally(() => {
      const watchPaths: string[] = [contentDir, publicDir];

      // Watch config files (nav.json, authors.json, site config) via the
      // project root directory (depth 0). Chokidar v4 doesn't emit unlink
      // for individually watched files, so we must watch the directory.
      const jsonDataDir = getJsonDataDir();
      const configFilePaths = new Set([
        ...JSON_DATA_FILES.map(f => path.resolve(jsonDataDir, f)),
        path.resolve('site.dev.json'),
      ]);
      const configWatcher = chokidar.watch(jsonDataDir, {
        ignoreInitial: true,
        depth: 0,
        awaitWriteFinish: { stabilityThreshold: 100 },
      });
      const onConfigFileChange = (filePath: string) => {
        if (configFilePaths.has(path.resolve(filePath))) {
          onFileChange(filePath);
        }
      };
      configWatcher.on('add', onConfigFileChange);
      configWatcher.on('change', onConfigFileChange);
      configWatcher.on('unlink', onConfigFileChange);

      const watcher = chokidar.watch(watchPaths, {
        ignoreInitial: true,
        awaitWriteFinish: { stabilityThreshold: 100 },
      });

      watcher.on('change', onFileChange);
      watcher.on('add', onFileChange);
      watcher.on('unlink', onFileChange);

      let watchersReady = 0;

      function onWatcherReady(): void {
        if (++watchersReady < 2) {
          return;
        }
        watcherReady = true;
        if (initialBuildFailed) {
          broadcast('error');
        }
        broadcast('ready');
        log.info`Watching for changes...`;
      }

      configWatcher.on('ready', onWatcherReady);
      watcher.on('ready', onWatcherReady);
    });

  // Return a promise that never resolves (watch mode runs until killed)
  return new Promise(() => {});
}
