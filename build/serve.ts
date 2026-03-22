import fs from 'fs';
import path from 'path';
import { getDistDir } from './util';
import { makeLogger } from './log';
import { B } from './colors';

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

function getPortArg(): number {
  const idx = process.argv.indexOf('--port');
  if (idx === -1) {
    return 8080;
  }
  const raw = process.argv[idx + 1];
  if (!raw) {
    log.error`--port requires a value`;
    process.exit(1);
  }
  const port = parseInt(raw, 10);
  if (isNaN(port) || port <= 0 || port >= 65536) {
    log.error`Invalid port value: ${raw}`;
    process.exit(1);
  }
  return port;
}

function listen(port: number): void {
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
  } catch (err) {
    log.error`Failed to start server on port ${port}: ${err}`;
    process.exit(1);
  }
}

listen(getPortArg());

process.on('uncaughtException', err => {
  log.error`Uncaught exception: ${err}`;
  process.exit(1);
});

process.on('unhandledRejection', reason => {
  log.error`Unhandled rejection: ${reason}`;
  process.exit(1);
});
