import type { WatchEngineOptions, WatchLifecycleEvent } from './types';

export async function emitWatchEvent<Snapshot, Plan, Meta>(
  options: WatchEngineOptions<Snapshot, Plan, Meta>,
  event: WatchLifecycleEvent<Snapshot, Meta>,
): Promise<void> {
  if (options.onEvent) {
    await options.onEvent(event);
  }
}
