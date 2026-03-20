import fs from 'fs';
import path from 'path';
import { getDistDir } from './util.js';
import { makeLogger } from './log.js';
import { B } from './colors.js';

const log = makeLogger(__filename);

function messageReady(port: number): void {
  if (process.send) {
    process.send({ ready: true, port });
  }
}

let distDir: string;
try {
  distDir = getDistDir();
} catch (err) {
  log.error`Failed to start server: ${err}`;
  process.exit(1);
}

function resolvePathname(pathname: string): string | null {
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

  if (stat.isDirectory()) {
    return null;
  }

  if (!stat.isFile()) {
    return null;
  }

  return resolvedPath;
}

function createResponse(req: Request): Response {
  const url = new URL(req.url);
  const filePath = resolvePathname(url.pathname);
  if (!filePath) {
    return new Response('Not Found', { status: 404 });
  }

  return new Response(Bun.file(filePath));
}

function tryListen(
  port: number,
  fallbackPort: number | null,
): Promise<ReturnType<typeof Bun.serve>> {
  return new Promise((resolve, reject) => {
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
      messageReady(server.port as number);
      resolve(server);
    } catch (err: unknown) {
      if (
        err instanceof Error &&
        (err as NodeJS.ErrnoException).code === 'EADDRINUSE' &&
        fallbackPort
      ) {
        log.warn`Port ${port} in use, trying fallback ${fallbackPort}...`;
        return tryListen(fallbackPort, null).then(resolve).catch(reject);
      }

      reject(err);
    }
  });
}

tryListen(8080, 8081).catch(err => {
  log.error`Failed to start server: ${err}`;
  process.exit(1);
});

process.on('uncaughtException', err => {
  log.error`Uncaught exception: ${err}`;
  process.exit(1);
});

process.on('unhandledRejection', reason => {
  log.error`Unhandled rejection: ${reason}`;
  process.exit(1);
});
