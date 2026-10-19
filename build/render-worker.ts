// Runs the renderer modules of one build. Each build starts a new worker, so
// renderers are imported from their source files with nothing cached from an
// earlier build, and each render call gets its own copy of what it is passed.
import { pathToFileURL } from 'url';
import { parentPort, workerData } from 'node:worker_threads';
import {
  getRenderOutputError,
  validateRendererModule,
} from './custom-elements';
import {
  SIGNAL_EXITED,
  SIGNAL_REPLIED,
  type RendererModule,
  type RenderReply,
  type RenderRequest,
  type RenderWorkerData,
  type RenderWorkerReady,
} from './render-protocol';
import type { Render } from '../types/client';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// Renderers run in Bun, which has no use for styles that shared modules import
Bun.plugin({
  name: 'tada-stylesheet-stub',
  setup(build) {
    build.onLoad({ filter: /\.s?css$/ }, () => ({
      contents: '',
      loader: 'js',
    }));
  },
});

async function load(
  modules: readonly RendererModule[],
): Promise<Map<string, ReadonlyMap<string, Render>>> {
  const loaded = new Map<string, ReadonlyMap<string, Render>>();
  for (const { script, filePath, file } of modules) {
    let module: Record<string, unknown>;
    try {
      module = await import(pathToFileURL(filePath).href);
    } catch (error) {
      throw new Error(`${file}: failed to load: ${errorMessage(error)}`, {
        cause: error,
      });
    }
    loaded.set(script, validateRendererModule(module, file).elements);
  }
  return loaded;
}

function render(
  loaded: ReadonlyMap<string, ReadonlyMap<string, Render>>,
  { script, name, info }: RenderRequest,
): RenderReply {
  try {
    const html: unknown = loaded.get(script)!.get(name)!(info);
    const problem = getRenderOutputError(html);
    return problem
      ? { ok: false, message: problem }
      : { ok: true, html: html as string };
  } catch (error) {
    return { ok: false, message: errorMessage(error) };
  }
}

const { modules, port, signal } = workerData as RenderWorkerData;

// An error that no render call catches, such as one thrown from a renderer's
// timer, would otherwise end the worker; every later call reports it instead
let failure: string | null = null;
const recordFailure = (error: unknown) => {
  failure ??= `a renderer threw after loading: ${errorMessage(error)}`;
};
process.on('uncaughtException', recordFailure);
process.on('unhandledRejection', recordFailure);
// Wakes a main thread that is waiting for a reply, such as when a renderer
// calls process.exit()
process.on('exit', () => {
  Atomics.store(signal, 0, SIGNAL_EXITED);
  Atomics.notify(signal, 0);
});

try {
  const loaded = await load(modules);
  port.on('message', (request: RenderRequest) => {
    const reply = render(loaded, request);
    port.postMessage(
      failure ? { ok: false, message: failure, fatal: true } : reply,
    );
    Atomics.store(signal, 0, SIGNAL_REPLIED);
    Atomics.notify(signal, 0);
  });
  parentPort!.postMessage({
    ok: true,
    elements: Object.fromEntries(
      [...loaded].map(([script, elements]) => [script, [...elements.keys()]]),
    ),
  } satisfies RenderWorkerReady);
} catch (error) {
  parentPort!.postMessage({
    ok: false,
    message: errorMessage(error),
  } satisfies RenderWorkerReady);
}
