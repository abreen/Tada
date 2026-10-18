import fs from 'fs';
import os from 'os';
import path from 'path';
import { pathToFileURL } from 'url';
import type { PluginBuilder } from 'bun';
import {
  createImportCheckPlugin,
  findScriptProblem,
  RENDERER_SUFFIXES,
  scriptExists,
  type AuthorScripts,
} from './author-scripts';
import { normalizeBundlePath, runBuild } from './bundle';
import {
  validateRendererModule,
  type ScriptRenderers,
} from './custom-elements';
import { findPackageDir, parseNpmSpecifier } from './packages';
import {
  isInside,
  isValidPublicAssetPath,
  realPath,
  toPosix,
} from './utils/paths';

/** A script's compiled renderer module */
export interface CompiledRenderers extends ScriptRenderers {
  /** The compiled file's name, which changes when its code does */
  output: string;
}

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
 * The renderer module of each script that has one, keyed by script. Scripts
 * that can't be found are skipped; their pages report them.
 */
function findRenderers(
  scripts: readonly string[],
  srcDir: string,
  projectDir: string,
): Map<string, string> {
  const renderers = new Map<string, string>();
  for (const script of scripts) {
    if (findScriptProblem(script, srcDir, projectDir)) {
      continue;
    }
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

// Compiles one renderer module into `outDir` and returns the entry's name
async function compileRenderer(
  file: string,
  outDir: string,
  srcDir: string,
  projectDir: string,
): Promise<string> {
  const result = await runBuild({
    entrypoints: [file],
    format: 'esm',
    target: 'bun',
    sourcemap: 'inline',
    naming: '[name]-[hash].[ext]',
    plugins: [
      createStylesheetStubPlugin(),
      createImportCheckPlugin(realPath(srcDir), projectDir),
    ],
  });
  let entry: string | undefined;
  for (const output of result.outputs) {
    const outputPath = normalizeBundlePath(output.path);
    const target = path.join(outDir, ...outputPath.split('/'));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, new Uint8Array(await output.arrayBuffer()));
    if (output.kind === 'entry-point') {
      entry = outputPath;
    }
  }
  return entry!;
}

/**
 * Compiles and loads the renderer module of each listed script that has one,
 * keyed by script. Bun can only import modules from files, so each compiled
 * module is written to a new temporary directory and imported from there, and
 * the directory is removed afterwards. New paths make Bun read every module
 * again, so a rebuild in watch mode never reuses a module from an earlier one.
 */
export async function bundleAuthorRenderers(
  scripts: readonly string[],
  srcDir: string,
  projectDir: string,
): Promise<Map<string, CompiledRenderers>> {
  const files = findRenderers(scripts, srcDir, projectDir);
  const compiled = new Map<string, CompiledRenderers>();
  if (files.size === 0) {
    return compiled;
  }
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tada-render-'));
  try {
    const entries = await Promise.all(
      [...files.values()].map((file, index) =>
        compileRenderer(
          file,
          path.join(tempDir, String(index)),
          srcDir,
          projectDir,
        ),
      ),
    );
    for (const [index, [script, file]] of [...files].entries()) {
      const entryPath = path.join(tempDir, String(index), entries[index]!);
      const displayPath = toPosix(path.relative(projectDir, file));
      let module: Record<string, unknown>;
      try {
        module = await import(pathToFileURL(entryPath).href);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`${displayPath}: failed to load: ${message}`, {
          cause: error,
        });
      }
      compiled.set(script, {
        ...validateRendererModule(module, displayPath),
        output: entries[index]!,
      });
    }
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
  return compiled;
}

/** Adds compiled renderers to a build's compiled scripts */
export function addRenderers(
  authorScripts: AuthorScripts,
  renderers: ReadonlyMap<string, CompiledRenderers>,
): AuthorScripts {
  const entries = new Map(authorScripts.entries);
  for (const [script, { output }] of renderers) {
    const outputs = entries.get(script);
    if (outputs) {
      entries.set(script, { ...outputs, render: output });
    }
  }
  return { ...authorScripts, entries, renderers };
}
