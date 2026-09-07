import { getDistDir } from '../util';
import { runWatchEngine } from './engine';
import { TadaWatchCompiler } from './compiler';
import { TadaWatchRuntime } from './runtime';

export async function runWatch(options: { httpPort?: number }): Promise<void> {
  const runtime = new TadaWatchRuntime({
    httpPort: options.httpPort,
    distDir: getDistDir(),
  });

  const compiler = new TadaWatchCompiler();
  const handle = runWatchEngine({
    targets: compiler.getWatchTargets(),
    build: paths => compiler.build(paths),
    onEvent: event => runtime.onEvent(event),
    debounceMs: 300,
  });
  try {
    await handle.done;
  } finally {
    runtime.close();
  }
}
