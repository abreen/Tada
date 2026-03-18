#!/usr/bin/env node
const webpack = require('webpack');
const { fork } = require('child_process');
const path = require('path');
const WebSocket = require('ws');
const { B, G } = require('./colors');
const { makeLogger, getFlair } = require('./log');
const getConfig = require('./config.dev');
const ContentWatchPlugin = require('./content-watch-plugin');
const { getContentDir } = require('./util');

const WEBSOCKET_PORT = 35729;

const log = makeLogger(__filename);
const wslog = makeLogger('WebSocket');
const contentDir = getContentDir();

function broadcast(msg) {
  if (wss == null || !webSocketsReady) {
    return;
  }
  wslog.debug(`Broadcasting "${msg}" to WebSocket clients...`);
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  });
}

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

function logChangedMarkdownFiles(files, { skip = new Set() } = {}) {
  if (!files) {
    return;
  }

  const markdownPaths = [...files]
    .map(toContentMarkdownPath)
    .filter(markdownPath => markdownPath && !skip.has(markdownPath))
    .sort();

  for (const markdownPath of markdownPaths) {
    log.event`${B`${markdownPath}`} changed, rebuilding...`;
  }
}

let webSocketsReady = false;
let webServerReady = false;
let webServerTimeout;
let serveStarted = false;
let currentWatcher = null;

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

async function startWatching() {
  const config = await getConfig({ watchMode: true });
  const compiler = webpack(config);
  const loggedInvalidationFiles = new Set();

  compiler.hooks.invalid.tap('WatchChangedFileLog', fileName => {
    broadcast('rebuilding');

    const markdownPath = toContentMarkdownPath(fileName);
    if (markdownPath) {
      loggedInvalidationFiles.add(markdownPath);
      log.event`${B`${markdownPath}`} changed, rebuilding...`;
    }
  });

  currentWatcher = compiler.watch({ aggregateTimeout: 300 }, (err, stats) => {
    logChangedMarkdownFiles(compiler.modifiedFiles, {
      skip: loggedInvalidationFiles,
    });
    loggedInvalidationFiles.clear();

    if (ContentWatchPlugin.needsRestart()) {
      ContentWatchPlugin.clearRestart();
      log.event`Content changed, restarting Webpack compiler...`;
      currentWatcher.close(() => startWatching());
      return;
    }

    if (err) {
      log.error`Build failed: ${err.message}`;
    } else if (stats.hasErrors()) {
      process.stderr.write(stats.toString('errors-only') + '\n');
      log.error`Build failed`;
    } else {
      log.event`${getFlair()}  Webpack build completed ${G`successfully`}`;
      broadcast('reload');
    }
    if (!serveStarted && !err && !stats.hasErrors()) {
      serveStarted = true;
      serve();
    }
  });
}

startWatching();
