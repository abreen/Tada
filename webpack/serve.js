const fs = require('fs');
const path = require('path');
const { getDistDir } = require('./util');
const { makeLogger } = require('./log');
const { B } = require('./colors');

const log = makeLogger(__filename, 'debug');

function messageReady(port) {
  if (process.send) {
    process.send({ ready: true, port });
  }
}

let distDir;
try {
  distDir = getDistDir();
} catch (err) {
  log.error`Failed to start server: ${err}`;
  process.exit(1);
}

function resolvePathname(pathname) {
  let decodedPath;
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

  let stat;
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

function createResponse(req) {
  const url = new URL(req.url);
  const filePath = resolvePathname(url.pathname);
  if (!filePath) {
    return new Response('Not Found', { status: 404 });
  }

  return new Response(Bun.file(filePath));
}

function tryListen(port, fallbackPort) {
  return new Promise((resolve, reject) => {
    try {
      const server = Bun.serve({
        port,
        fetch: createResponse,
        error(error) {
          log.error`Request failed: ${error}`;
          return new Response('Internal Server Error', { status: 500 });
        },
      });

      log.note`Dev server: ${B`http://localhost:${server.port}/index.html`}`;
      messageReady(server.port);
      resolve(server);
    } catch (err) {
      if (err.code === 'EADDRINUSE' && fallbackPort) {
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
