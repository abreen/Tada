import { getDistDir } from '../util';
import { runWatchEngine } from '../../watch/engine';
import { TadaWatchCompiler } from './compiler';
import { TadaWatchRuntime } from './runtime';

export async function runWatch(options: {
  httpPort?: number;
  wsPort?: number;
}): Promise<void> {
  const wsPort = options.wsPort ?? 35729;
  const runtime = new TadaWatchRuntime({
    wsPort,
    httpPort: options.httpPort,
    distDir: getDistDir(),
  });

  await runWatchEngine({
    compiler: new TadaWatchCompiler({ wsPort }),
    onEvent: event => runtime.onEvent(event),
    debounceMs: 300,
  });
}
