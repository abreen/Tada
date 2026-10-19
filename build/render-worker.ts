// Runs the renderer modules of one build. Each build starts a new worker, so
// renderers are imported from their source files with nothing cached from an
// earlier build, and each render call gets its own copy of what it is passed.
import { pathToFileURL } from 'url';
import { parentPort, workerData, type MessagePort } from 'node:worker_threads';
import {
  getRenderOutputError,
  validateRendererModule,
} from './custom-elements';
import type { Render, RenderInfo } from '../types/client';

/** A renderer module for the worker to import */
export interface RendererModule {
  script: string;
  /** The module's path */
  filePath: string;
  /** The module's path for error messages, such as `src/a.render.ts` */
  file: string;
}

export interface RenderWorkerData {
  modules: RendererModule[];
  /** Carries render requests and replies */
  port: MessagePort;
  /** Set to 1 once a reply is posted, so the main thread can wait for it */
  signal: Int32Array;
}

/** The worker's first message: each script's element names, or an error */
export type RenderWorkerReady =
  | { ok: true; elements: Record<string, string[]> }
  | { ok: false; message: string };

export interface RenderRequest {
  script: string;
  name: string;
  info: RenderInfo;
}

export type RenderReply =
  | { ok: true; html: string }
  | { ok: false; message: string };

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
try {
  const loaded = await load(modules);
  port.on('message', (request: RenderRequest) => {
    port.postMessage(render(loaded, request));
    Atomics.store(signal, 0, 1);
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
