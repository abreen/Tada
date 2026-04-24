import { getDistDir } from '../util';
import { runWatchEngine } from '../../watch/engine';
import { TadaWatchCompiler } from './compiler';
import { TadaWatchRuntime } from './runtime';

export async function runWatch(options: { httpPort?: number }): Promise<void> {
  const runtime = new TadaWatchRuntime({
    httpPort: options.httpPort,
    distDir: getDistDir(),
  });

  await runWatchEngine({
    compiler: new TadaWatchCompiler(),
    onEvent: event => runtime.onEvent(event),
    debounceMs: 300,
  });
}
