import type { CommitPlan } from '../output-publication';
import type { CompilerBuildResult } from './snapshot';
import { createBuildMeta, type TadaSnapshot } from './snapshot';
import { diagnosticsFromMessages } from '../build-validation';

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
