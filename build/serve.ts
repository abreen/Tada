import fs from 'fs';
import path from 'path';
import { makeLogger } from './log';
import { B } from './colors';

const log = makeLogger(import.meta.url);

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
}

export function startServer(options: StartServerOptions): void {
  const { port = 8080, distDir, onReady } = options;

  function createResponse(req: Request): Response {
    const url = new URL(req.url);
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
  }

  try {
    const server = Bun.serve({
      port,
      fetch: createResponse,
      error(error: Error) {
        log.error`Request failed: ${error}`;
        return new Response('Internal Server Error', { status: 500 });
      },
    });

    log.info`Dev server: ${B`http://localhost:${server.port}/index.html`}`;
    if (onReady) {
      onReady(server.port!);
    }
  } catch (err) {
    log.error`Failed to start server on port ${port}: ${err}`;
    process.exit(1);
  }
}
