import { createContentRecord, createPublicRecord } from '../source-records';
import type { TadaSourceRecord } from '../source-records';
import type { CompilerBuildResult } from './snapshot';
import type { BuildDiagnostic, WatchTraceOptions } from '../build-types';
import { removeDirIfExists, writeAssets } from './assets';

export function buildFailedWithDiagnostics(
  outputDir: string,
  diagnostics: BuildDiagnostic[],
): CompilerBuildResult {
  removeDirIfExists(outputDir);
  return { ok: false, diagnostics };
}

type RenderOptions = Omit<
  Parameters<typeof createContentRecord>[0],
  'traceToolAvailability'
> & { traceOptions: WatchTraceOptions };

export function renderSource({
  traceOptions,
  ...options
}: RenderOptions): TadaSourceRecord | undefined {
  const record =
    options.scan.sources.get(options.filePath)?.kind === 'public'
      ? createPublicRecord(options.filePath, options.scan.publicDir)
      : createContentRecord({
          ...options,
          traceToolAvailability: traceOptions.toolAvailability,
        });
  if (!record.outputs.size) {
    return;
  }
  writeAssets(options.outputDir, record.outputs);
  return record;
}
