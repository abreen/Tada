import type { ChokidarOptions } from 'chokidar';
import type { TadaBuildMeta } from './compiler-types';
import type { TadaSnapshot } from './snapshot';

export type WatchEventKind = 'add' | 'change' | 'unlink';

export interface FileChange {
  path: string;
  kind: WatchEventKind;
}

export interface ChangeBatch {
  changes: FileChange[];
}

export interface WatchTarget {
  path: string;
  chokidar?: ChokidarOptions;
  filter?: (filePath: string) => boolean;
}

export interface WatchDiagnostic {
  message: string;
}

export interface WriteFileMutation {
  kind: 'write';
  path: string;
  content: string | Buffer;
}

export interface DeleteFileMutation {
  kind: 'delete';
  path: string;
}

export type FileMutation = WriteFileMutation | DeleteFileMutation;

export interface ReplaceRootCommitPlan {
  kind: 'replace-root';
  stagedPath: string;
  targetPath: string;
}

export interface ApplyMutationsCommitPlan {
  kind: 'apply-mutations';
  rootDir: string;
  mutations: FileMutation[];
}

export type CommitPlan = ReplaceRootCommitPlan | ApplyMutationsCommitPlan;

export type CompilerBuildResult =
  | {
      ok: true;
      snapshot: TadaSnapshot;
      commit: CommitPlan;
      meta: TadaBuildMeta;
    }
  | { ok: false; diagnostics: WatchDiagnostic[] };

export interface WatchCompiler {
  getWatchTargets(): WatchTarget[];
  build(
    snapshot: TadaSnapshot | undefined,
    batch?: ChangeBatch,
  ): Promise<CompilerBuildResult>;
}

export type WatchLifecycleEvent =
  | { kind: 'watching' }
  | { kind: 'build-started'; batch?: ChangeBatch }
  | { kind: 'build-succeeded'; batch?: ChangeBatch; meta: TadaBuildMeta }
  | {
      kind: 'build-failed';
      batch?: ChangeBatch;
      diagnostics: WatchDiagnostic[];
    };

export interface WatchEngineOptions {
  compiler: WatchCompiler;
  debounceMs?: number;
  onEvent?: (event: WatchLifecycleEvent) => void | Promise<void>;
}
