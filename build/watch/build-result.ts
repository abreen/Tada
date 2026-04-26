import type { CommitPlan, CompilerBuildResult } from './types';
import { createBuildMeta, type TadaSnapshot } from './snapshot';
import { diagnosticsFromMessages } from './validation';

export function buildSucceeded(
  snapshot: TadaSnapshot,
  commit: CommitPlan,
): CompilerBuildResult {
  return { ok: true, snapshot, commit, meta: createBuildMeta(snapshot) };
}

export function buildFailedFromError(error: unknown): CompilerBuildResult {
  return {
    ok: false,
    diagnostics: diagnosticsFromMessages([
      error instanceof Error ? error.message : String(error),
    ]),
  };
}
