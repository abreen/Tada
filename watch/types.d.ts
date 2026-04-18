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
  chokidar?: { depth?: number };
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

export type CompilerPlanResult<Plan> =
  | { kind: 'skip' }
  | { kind: 'build'; plan: Plan };

export type CompilerBuildResult<Snapshot, Meta> =
  | {
      ok: true;
      snapshot: Snapshot;
      commit: CommitPlan;
      diagnostics?: WatchDiagnostic[];
      meta?: Meta;
    }
  | { ok: false; diagnostics: WatchDiagnostic[]; meta?: Meta };

export interface WatchCompiler<Snapshot, Plan, Meta> {
  getWatchTargets(): WatchTarget[];
  buildInitial(): Promise<CompilerBuildResult<Snapshot, Meta>>;
  plan(
    snapshot: Snapshot | undefined,
    batch: ChangeBatch,
  ): Promise<CompilerPlanResult<Plan>>;
  run(
    plan: Plan,
    snapshot: Snapshot | undefined,
  ): Promise<CompilerBuildResult<Snapshot, Meta>>;
}

export type WatchLifecycleEvent<Snapshot, Meta> =
  | { kind: 'watching' }
  | { kind: 'build-started'; batch?: ChangeBatch; initial: boolean }
  | {
      kind: 'build-succeeded';
      initial: boolean;
      batch?: ChangeBatch;
      changed: boolean;
      snapshot: Snapshot;
      meta?: Meta;
      diagnostics: WatchDiagnostic[];
    }
  | {
      kind: 'build-failed';
      initial: boolean;
      batch?: ChangeBatch;
      diagnostics: WatchDiagnostic[];
      meta?: Meta;
    }
  | { kind: 'build-skipped'; batch: ChangeBatch };

export interface WatchEngineOptions<Snapshot, Plan, Meta> {
  compiler: WatchCompiler<Snapshot, Plan, Meta>;
  debounceMs?: number;
  onEvent?: (
    event: WatchLifecycleEvent<Snapshot, Meta>,
  ) => void | Promise<void>;
}
