import path from 'path';
import { B } from '../colors';
import { makeLogger, printFlair } from '../log';
import { startServer } from '../serve';
import { WatchPagefindRunner } from '../pagefind';
import type { TadaBuildMeta } from './compiler-types';
import type { TadaSnapshot } from './snapshot';
import type { WatchLifecycleEvent } from '../../watch/types';
import {
  WATCH_RELOAD_MESSAGE_REBUILDING,
  WATCH_RELOAD_MESSAGE_RELOAD,
  WATCH_RELOAD_PATH,
  WATCH_RELOAD_TOPIC,
} from './reload';

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
  private httpPort: number | undefined;
  private distDir: string;
  private server: Bun.Server<undefined> | null;
  private lastBuildFailed: boolean;
  private pagefindRunner: WatchPagefindRunner | undefined;
  private pagefindSiteVariablesKey: string | undefined;

  constructor({ httpPort, distDir }: { httpPort?: number; distDir: string }) {
    this.httpPort = httpPort;
    this.distDir = distDir;
    this.server = null;
    this.lastBuildFailed = false;
    this.pagefindSiteVariablesKey = undefined;
  }

  private broadcast(message: string): void {
    if (!this.server) {
      return;
    }
    this.server.publish(WATCH_RELOAD_TOPIC, message);
  }

  private ensureServerStarted(): void {
    if (this.server) {
      return;
    }
    this.server = startServer({
      port: this.httpPort,
      distDir: this.distDir,
      watchReload: {
        onClientOpen: () => {
          wslog.debug`WebSocket client connected`;
        },
        onClientClose: () => {
          wslog.debug`WebSocket client disconnected`;
        },
      },
    });
    wslog.debug`WebSocket server listening at ws://localhost:${this.server.port}${WATCH_RELOAD_PATH}`;
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
          this.broadcast(WATCH_RELOAD_MESSAGE_REBUILDING);
        }
        return;
      case 'build-succeeded': {
        const recoveredFromFailure = this.lastBuildFailed;
        this.lastBuildFailed = false;
        printFlair();
        this.ensureServerStarted();
        if (!event.initial && (event.changed || recoveredFromFailure)) {
          this.broadcast(WATCH_RELOAD_MESSAGE_RELOAD);
        }
        if (event.meta && event.changed) {
          if (event.meta.siteVariables.features.search !== false) {
            const siteVariablesKey = JSON.stringify(event.meta.siteVariables);
            if (
              !this.pagefindRunner ||
              this.pagefindSiteVariablesKey !== siteVariablesKey
            ) {
              this.pagefindRunner = new WatchPagefindRunner();
              this.pagefindSiteVariablesKey = siteVariablesKey;
            }
            this.pagefindRunner.update(
              this.distDir,
              event.meta.htmlAssetsByPath,
              event.meta.htmlAnalysisByPath,
            );
            setImmediate(() => this.pagefindRunner!.run());
          } else {
            this.pagefindRunner = undefined;
            this.pagefindSiteVariablesKey = undefined;
          }
        }
        return;
      }
      case 'build-failed':
        this.lastBuildFailed = true;
        for (const diagnostic of event.diagnostics) {
          log.error`${diagnostic.message}`;
        }
        return;
      case 'watching':
        log.info`Watching for changes...`;
        return;
      case 'build-skipped':
        return;
    }
  }
}
