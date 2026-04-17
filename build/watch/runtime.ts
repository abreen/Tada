import path from 'path';
import WebSocket, { WebSocketServer } from 'ws';
import { B } from '../colors';
import { makeLogger, printFlair } from '../log';
import { startServer } from '../serve';
import { WatchPagefindRunner } from '../pagefind';
import type { TadaBuildMeta } from './compiler-types';
import type { TadaSnapshot } from './snapshot';
import type { WatchLifecycleEvent } from '../../watch/types';

const log = makeLogger(import.meta.url);
const wslog = makeLogger('WebSocket');

function describeChange(kind: 'add' | 'change' | 'unlink'): string {
  if (kind === 'add') {
    return 'added, rebuilding';
  }
  if (kind === 'unlink') {
    return 'removed, rebuilding';
  }
  return 'changed, rebuilding';
}

export class TadaWatchRuntime {
  private wsPort: number;
  private httpPort: number | undefined;
  private distDir: string;
  private wss: WebSocketServer | null;
  private watching: boolean;
  private lastBuildFailed: boolean;
  private serveStarted: boolean;
  private pagefindRunner: WatchPagefindRunner | undefined;
  private pagefindSiteVariablesKey: string | undefined;

  constructor({
    wsPort,
    httpPort,
    distDir,
  }: {
    wsPort: number;
    httpPort?: number;
    distDir: string;
  }) {
    this.wsPort = wsPort;
    this.httpPort = httpPort;
    this.distDir = distDir;
    this.watching = false;
    this.lastBuildFailed = false;
    this.serveStarted = false;
    this.pagefindSiteVariablesKey = undefined;
    this.wss = new WebSocketServer({ port: wsPort });

    this.wss.on('connection', conn => {
      wslog.debug`WebSocket client connected`;
      if (this.watching && conn.readyState === WebSocket.OPEN) {
        if (this.lastBuildFailed) {
          conn.send('error');
        }
        conn.send('ready');
      }
      conn.on('close', () => {
        wslog.debug`WebSocket client disconnected`;
      });
    });

    this.wss.on('listening', () => {
      wslog.debug`WebSocket server listening at ws://localhost:${this.wsPort}`;
    });

    this.wss.on('error', err => {
      wslog.error`WebSocket server error: ${err.message}`;
    });
  }

  private broadcast(message: string): void {
    if (!this.wss) {
      return;
    }
    for (const client of this.wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    }
  }

  private ensureServerStarted(): void {
    if (this.serveStarted) {
      return;
    }
    this.serveStarted = true;
    startServer({ port: this.httpPort, distDir: this.distDir });
  }

  async onEvent(
    event: WatchLifecycleEvent<TadaSnapshot, TadaBuildMeta>,
  ): Promise<void> {
    switch (event.kind) {
      case 'build-started':
        if (!event.initial) {
          for (const change of event.batch?.changes || []) {
            log.event`${B`${path.basename(change.path)}`} ${describeChange(change.kind)}`;
          }
          this.broadcast('rebuilding');
        }
        return;
      case 'build-succeeded':
        this.lastBuildFailed = false;
        printFlair();
        this.ensureServerStarted();
        if (!event.initial) {
          this.broadcast('reload');
        }
        if (event.meta) {
          if (event.meta.siteVariables.features.search !== false) {
            const siteVariablesKey = JSON.stringify(event.meta.siteVariables);
            if (
              !this.pagefindRunner ||
              this.pagefindSiteVariablesKey !== siteVariablesKey
            ) {
              this.pagefindRunner = new WatchPagefindRunner(
                event.meta.siteVariables,
              );
              this.pagefindSiteVariablesKey = siteVariablesKey;
            }
            this.pagefindRunner.update(
              this.distDir,
              event.meta.htmlAssetsByPath,
            );
            setImmediate(() => this.pagefindRunner!.run());
          } else {
            this.pagefindRunner = undefined;
            this.pagefindSiteVariablesKey = undefined;
          }
        }
        return;
      case 'build-failed':
        this.lastBuildFailed = true;
        for (const diagnostic of event.diagnostics) {
          log.error`${diagnostic.message}`;
        }
        this.broadcast('error');
        return;
      case 'watching':
        this.watching = true;
        if (this.lastBuildFailed) {
          this.broadcast('error');
        }
        this.broadcast('ready');
        log.info`Watching for changes...`;
        return;
      case 'build-skipped':
        return;
    }
  }
}
