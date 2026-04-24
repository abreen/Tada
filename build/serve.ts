import fs from 'fs';
import path from 'path';
import { makeLogger } from './log';
import { B } from './colors';
import { WATCH_RELOAD_PATH, WATCH_RELOAD_TOPIC } from './watch/reload';

const log = makeLogger(import.meta.url);

interface ServerUpgradeTarget {
  upgrade(req: Request): boolean;
}

export function resolvePathname(
  distDir: string,
  pathname: string,
): { filePath: string; mtime: Date } | null {
  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    return null;
  }

  const resolvedPath = path.resolve(distDir, '.' + decodedPath);
  const relativePath = path.relative(distDir, resolvedPath);
  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    return null;
  }

  let stat: fs.Stats;
  try {
    stat = fs.statSync(resolvedPath);
  } catch {
    return null;
  }

  if (!stat.isFile()) {
    return null;
  }

  return { filePath: resolvedPath, mtime: stat.mtime };
}

export interface StartServerOptions {
  port?: number;
  distDir: string;
  onReady?: (port: number) => void;
  watchReload?: { onClientOpen?: () => void; onClientClose?: () => void };
}

export function createDevServerFetchHandler(
  distDir: string,
  watchReloadEnabled = false,
) {
  return (req: Request, server: ServerUpgradeTarget): Response | undefined => {
    const url = new URL(req.url);
    if (watchReloadEnabled && url.pathname === WATCH_RELOAD_PATH) {
      return server.upgrade(req)
        ? undefined
        : new Response('WebSocket upgrade error', { status: 400 });
    }

    const result = resolvePathname(distDir, url.pathname);
    if (!result) {
      return new Response('Not Found', { status: 404 });
    }

    const headers = {
      'Cache-Control': 'no-cache',
      'Last-Modified': result.mtime.toUTCString(),
    };

    const ims = req.headers.get('If-Modified-Since');
    if (ims && new Date(ims) >= new Date(headers['Last-Modified'])) {
      return new Response(null, { status: 304, headers });
    }

    if (req.method === 'HEAD') {
      return new Response(null, { headers });
    }

    return new Response(Bun.file(result.filePath), { headers });
  };
}

export function startServer(options: StartServerOptions) {
  const { port = 8080, distDir, onReady, watchReload } = options;

  try {
    const fetch = createDevServerFetchHandler(distDir, Boolean(watchReload));
    const server = Bun.serve({
      port,
      fetch,
      error(error: Error) {
        log.error`Request failed: ${error}`;
        return new Response('Internal Server Error', { status: 500 });
      },
      websocket: {
        message() {},
        open(ws) {
          ws.subscribe(WATCH_RELOAD_TOPIC);
          watchReload?.onClientOpen?.();
        },
        close() {
          watchReload?.onClientClose?.();
        },
      },
    });

    log.info`Dev server: ${B`http://localhost:${server.port}/index.html`}`;
    if (onReady) {
      onReady(server.port!);
    }
    return server;
  } catch (err) {
    log.error`Failed to start server on port ${port}: ${err}`;
    process.exit(1);
  }
}
