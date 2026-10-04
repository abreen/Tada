import { createContentRecord, createPublicRecord } from '../source-records';
import type { TadaSourceRecord } from '../source-records';
import type { WatchTraceOptions } from '../build-types';

type RenderOptions = Omit<
  Parameters<typeof createContentRecord>[0],
  'traceToolAvailability' | 'isWatchMode'
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
          isWatchMode: true,
          traceToolAvailability: traceOptions.toolAvailability,
        });
  return record.outputs.size ? record : undefined;
}
