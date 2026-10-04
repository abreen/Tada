import type { ChokidarOptions } from 'chokidar';
import type { BuildDiagnostic } from '../build-types';
import type { TadaSnapshot } from '../site-build';

export interface WatchTarget {
  path: string;
  chokidar?: ChokidarOptions;
  filter?: (filePath: string) => boolean;
}

export type WatchBuildResult<Meta> =
  | { ok: true; meta: Meta }
  | { ok: false; diagnostics: BuildDiagnostic[] };

export type WatchLifecycleEvent<Meta> =
  | { kind: 'watching' }
  | { kind: 'build-started'; paths?: ReadonlySet<string> }
  | { kind: 'build-succeeded'; paths?: ReadonlySet<string>; meta: Meta }
  | {
      kind: 'build-failed';
      paths?: ReadonlySet<string>;
      diagnostics: BuildDiagnostic[];
    };

export interface WatchClock {
  setTimeout: typeof setTimeout;
  clearTimeout: typeof clearTimeout;
}

export interface WatchEngineOptions<Meta> {
  targets: WatchTarget[];
  build: (paths?: ReadonlySet<string>) => Promise<WatchBuildResult<Meta>>;
  debounceMs?: number;
  onEvent?: (event: WatchLifecycleEvent<Meta>) => void | Promise<void>;
}

export interface WatchHandle {
  done: Promise<void>;
  close(): Promise<void>;
}

/** The result of compiling one watch build, before it is written */
export type CompileOutcome =
  | {
      ok: true;
      snapshot: TadaSnapshot;
      /** Full builds are written against the files on disk */
      full: boolean;
      /** Sources whose outputs are rewritten even if they look unchanged */
      forceSourcePaths?: ReadonlySet<string>;
    }
  | { ok: false; diagnostics: BuildDiagnostic[] };
