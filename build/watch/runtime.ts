import path from 'path';
import { B } from '../colors';
import { makeLogger, printFlair } from '../log';
import { startServer } from '../serve';
import { WatchPagefindRunner } from '../pagefind';
import type { WatchLifecycleEvent } from './types';
import type { TadaBuildMeta } from '../build-types';
import {
  WATCH_RELOAD_MESSAGE_REBUILDING,
  WATCH_RELOAD_MESSAGE_RELOAD,
  WATCH_RELOAD_PATH,
  WATCH_RELOAD_TOPIC,
} from './reload';

const log = makeLogger(import.meta.url);
const wslog = makeLogger('WebSocket');

export class TadaWatchRuntime {
  private httpPort: number | undefined;
  private distDir: string;
  private server: Bun.Server<undefined> | null;
  private pagefindRunner: WatchPagefindRunner | undefined;
  private pagefindSiteVariablesKey: string | undefined;

  constructor({ httpPort, distDir }: { httpPort?: number; distDir: string }) {
    this.httpPort = httpPort;
    this.distDir = distDir;
    this.server = null;
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

  close(): void {
    this.server?.stop(true);
    this.server = null;
  }

  async onEvent(event: WatchLifecycleEvent<TadaBuildMeta>): Promise<void> {
    switch (event.kind) {
      case 'build-started':
        if (!event.paths) {
          return;
        }
        for (const filePath of event.paths) {
          log.event`${B`${path.basename(filePath)}`} changed, rebuilding`;
        }
        this.broadcast(WATCH_RELOAD_MESSAGE_REBUILDING);
        return;
      case 'build-succeeded': {
        printFlair();
        this.ensureServerStarted();
        if (event.paths) {
          this.broadcast(WATCH_RELOAD_MESSAGE_RELOAD);
        }
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
        return;
      }
      case 'build-failed':
        for (const diagnostic of event.diagnostics) {
          log.error`${diagnostic.message}`;
        }
        return;
      case 'watching':
        log.info`Watching for changes...`;
        return;
    }
  }
}
