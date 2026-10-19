import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  MessageChannel,
  receiveMessageOnPort,
  Worker,
  type MessagePort,
} from 'node:worker_threads';
import type { PluginBuilder } from 'bun';
import {
  createImportCheckPlugin,
  RENDERER_SUFFIXES,
  scriptExists,
  type AuthorScripts,
} from './author-scripts';
import { runBuild } from './bundle';
import type { ScriptRenderers } from './custom-elements';
import { findPackageDir, parseNpmSpecifier } from './packages';
import {
  isInside,
  isValidPublicAssetPath,
  realPath,
  toPosix,
} from './utils/paths';
import type {
  RenderReply,
  RenderRequest,
  RendererModule,
  RenderWorkerData,
  RenderWorkerReady,
} from './render-worker';
import type { Render } from '../types/client';

/** How long a render function can run before the build fails */
const RENDER_TIMEOUT_MS = 30_000;

const WORKER_PATH = fileURLToPath(
  new URL('./render-worker.ts', import.meta.url),
);

/**
 * The file a package's `tada.render` field names for one of its modules,
 * relative to the package directory, or null if it names none. `subpath` is
 * the path after the package name in an `npm:` script, which is empty for
 * the main module. Throws for a malformed field.
 */
export function getPackageRendererPath(
  manifest: unknown,
  subpath: string,
  name: string,
): string | null {
  const tada =
    manifest && typeof manifest === 'object'
      ? (manifest as Record<string, unknown>).tada
      : undefined;
  if (tada === undefined) {
    return null;
  }
  const render =
    tada && typeof tada === 'object'
      ? (tada as Record<string, unknown>).render
      : undefined;
  if (render === undefined) {
    return null;
  }
  if (!render || typeof render !== 'object' || Array.isArray(render)) {
    throw new Error(
      `package "${name}": "tada.render" in package.json must map module paths to renderer files, such as { ".": "./render.js" }`,
    );
  }
  const key = subpath ? `./${subpath}` : '.';
  const value = (render as Record<string, unknown>)[key];
  if (value === undefined) {
    return null;
  }
  if (
    typeof value !== 'string' ||
    !value.startsWith('./') ||
    !isValidPublicAssetPath(value.slice(2)) ||
    !/\.(ts|js)$/.test(value)
  ) {
    throw new Error(
      `package "${name}": "tada.render" "${key}" in package.json must be a relative path ending in .ts or .js, such as "./render.js"`,
    );
  }
  return value.slice(2);
}

// The renderer module of a script in src/, if it has one
function findSrcRenderer(script: string, srcDir: string): string | null {
  const base = script.replace(/\.(ts|js)$/, '');
  const found = RENDERER_SUFFIXES.map(suffix => `${base}${suffix}`).filter(
    file => scriptExists(srcDir, file),
  );
  if (found.length > 1) {
    throw new Error(
      `src/${script}: has two renderers, src/${found[0]} and src/${found[1]}; keep one`,
    );
  }
  if (found.length === 0) {
    return null;
  }
  const filePath = path.join(srcDir, ...found[0]!.split('/'));
  if (!isInside(realPath(srcDir), realPath(filePath))) {
    throw new Error(
      `src/${found[0]}: its real path is outside src/, such as through a symbolic link; renderers must be in src/`,
    );
  }
  return filePath;
}

// The renderer module of a package script, if its package names one
function findPackageRenderer(
  script: string,
  projectDir: string,
): string | null {
  const { name, subpath } = parseNpmSpecifier(script)!;
  const packageDir = findPackageDir(name, projectDir)!;
  const manifest: unknown = JSON.parse(
    fs.readFileSync(path.join(packageDir, 'package.json'), 'utf-8'),
  );
  const relative = getPackageRendererPath(manifest, subpath, name);
  if (relative === null) {
    return null;
  }
  const filePath = path.join(packageDir, ...relative.split('/'));
  if (!scriptExists(packageDir, relative)) {
    throw new Error(
      `script "${script}" renderer "./${relative}" does not exist in package "${name}"`,
    );
  }
  if (!isInside(realPath(packageDir), realPath(filePath))) {
    throw new Error(
      `script "${script}" renderer "./${relative}" is outside package "${name}"`,
    );
  }
  return filePath;
}

/**
 * The renderer module of each script that has one, keyed by script. `scripts`
 * are the scripts that compiled, so each one exists.
 */
function findRenderers(
  scripts: Iterable<string>,
  srcDir: string,
  projectDir: string,
): Map<string, string> {
  const renderers = new Map<string, string>();
  for (const script of scripts) {
    const file = parseNpmSpecifier(script)
      ? findPackageRenderer(script, projectDir)
      : findSrcRenderer(script, srcDir);
    if (file) {
      renderers.set(script, file);
    }
  }
  return renderers;
}

// Renderers run in Bun, which has no use for styles that shared modules import
function createStylesheetStubPlugin() {
  return {
    name: 'tada-stylesheet-stub',
    setup(build: PluginBuilder) {
      build.onLoad({ filter: /\.s?css$/ }, () => ({
        contents: 'export {};',
        loader: 'js' as const,
      }));
    },
  };
}

// The deepest directory that contains every file
function commonDir(files: readonly string[]): string {
  let dir = path.dirname(files[0]!);
  while (!files.every(file => isInside(dir, file))) {
    const parent = path.dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }
  return dir;
}

/**
 * Compiles every renderer module to report syntax errors with their positions
 * and to keep imports in a file in `src/` to `src/`, as for scripts. Its
 * output is not used: the renderer worker imports the modules themselves.
 * Packages are left out, since Bun loads them from `node_modules`, and any
 * file type can be imported, since renderers never run in a browser.
 */
async function checkRenderers(
  files: readonly string[],
  srcDir: string,
  projectDir: string,
): Promise<void> {
  await runBuild({
    entrypoints: [...files],
    root: commonDir(files),
    format: 'esm',
    target: 'bun',
    packages: 'external',
    naming: '[dir]/[name].[ext]',
    plugins: [
      createStylesheetStubPlugin(),
      createImportCheckPlugin(realPath(srcDir), projectDir, {
        checkFileTypes: false,
      }),
    ],
  });
}

const openHosts = new Set<RendererHost>();

/**
 * The worker that runs one build's renderer modules. Its render functions
 * block until the worker replies, since pages render synchronously.
 */
export class RendererHost {
  private stalled = false;

  constructor(
    private readonly worker: Worker,
    private readonly port: MessagePort,
    private readonly signal: Int32Array,
  ) {
    openHosts.add(this);
  }

  render(request: RenderRequest): string {
    if (this.stalled) {
      throw new Error('an earlier render function did not return');
    }
    Atomics.store(this.signal, 0, 0);
    this.port.postMessage(request);
    if (Atomics.wait(this.signal, 0, 0, RENDER_TIMEOUT_MS) === 'timed-out') {
      this.stalled = true;
      throw new Error(
        `did not return within ${RENDER_TIMEOUT_MS / 1000} seconds`,
      );
    }
    const reply = receiveMessageOnPort(this.port)!.message as RenderReply;
    if (!reply.ok) {
      throw new Error(reply.message);
    }
    return reply.html;
  }

  close(): void {
    openHosts.delete(this);
    this.port.close();
    void this.worker.terminate();
  }
}

/**
 * Stops the renderer workers of earlier builds, which watch mode no longer
 * uses, except `keep`, the one of the build it keeps
 */
export function closeRenderersExcept(keep: RendererHost | undefined): void {
  for (const host of openHosts) {
    if (host !== keep) {
      host.close();
    }
  }
}

// Starts a worker that imports the modules and resolves with each script's
// element names once they load
async function startRendererHost(
  modules: RendererModule[],
): Promise<{ host: RendererHost; elements: Record<string, string[]> }> {
  const { port1, port2 } = new MessageChannel();
  const signal = new Int32Array(new SharedArrayBuffer(4));
  const worker = new Worker(WORKER_PATH, {
    workerData: { modules, port: port2, signal } satisfies RenderWorkerData,
    transferList: [port2],
  });
  // Neither may keep a one-off build's process running
  worker.unref();
  port1.unref();
  const ready = await new Promise<RenderWorkerReady>(resolve => {
    worker.once('message', resolve);
    worker.once('error', (error: Error) =>
      resolve({ ok: false, message: error.message }),
    );
    worker.once('exit', code =>
      resolve({
        ok: false,
        message: `the renderer worker exited with code ${code}`,
      }),
    );
  });
  // A renderer's later errors, such as from a timer, would otherwise be
  // thrown in the main thread; a render call that never replies times out
  worker.on('error', () => {});
  const host = new RendererHost(worker, port1, signal);
  if (!ready.ok) {
    host.close();
    throw new Error(ready.message);
  }
  return { host, elements: ready.elements };
}

/**
 * Finds, checks, and loads the renderer modules of the scripts that compiled,
 * and adds their render functions to `authorScripts`. Each call starts a new
 * worker, so every module is read again.
 */
export async function loadAuthorRenderers(
  authorScripts: AuthorScripts,
  srcDir: string,
  projectDir: string,
): Promise<AuthorScripts> {
  const files = findRenderers(authorScripts.entries.keys(), srcDir, projectDir);
  if (files.size === 0) {
    return authorScripts;
  }
  await checkRenderers([...files.values()], srcDir, projectDir);
  const modules = [...files].map(([script, filePath]) => ({
    script,
    filePath,
    file: toPosix(path.relative(projectDir, filePath)),
  }));
  const { host, elements } = await startRendererHost(modules);
  const renderers = new Map<string, ScriptRenderers>();
  for (const { script, file } of modules) {
    renderers.set(script, {
      file,
      elements: new Map(
        elements[script]!.map(name => [
          name,
          (info => host.render({ script, name, info })) satisfies Render,
        ]),
      ),
    });
  }
  return { ...authorScripts, renderers, rendererHost: host };
}
