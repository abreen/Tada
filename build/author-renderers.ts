import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import {
  RENDERER_SUFFIXES,
  scriptExists,
  type AuthorScripts,
} from './author-scripts';
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
 * The renderer module of each script that has one, keyed by script. A script
 * that doesn't exist is reported by the pages that list it; a renderer next to
 * where it would be is loaded but never used.
 */
function findRenderers(
  scripts: Iterable<string>,
  srcDir: string,
  projectDir: string,
): Map<string, string> {
  const renderers = new Map<string, string>();
  for (const script of scripts) {
    const specifier = parseNpmSpecifier(script);
    if (specifier && !findPackageDir(specifier.name, projectDir)) {
      continue;
    }
    const file = specifier
      ? findPackageRenderer(script, projectDir)
      : findSrcRenderer(script, srcDir);
    if (file) {
      renderers.set(script, file);
    }
  }
  return renderers;
}

let stylesheetStubRegistered = false;

// Renderers run in Bun, which has no use for styles that shared modules
// import. Tada itself imports no stylesheets at run time.
function registerStylesheetStub(): void {
  if (stylesheetStubRegistered) {
    return;
  }
  stylesheetStubRegistered = true;
  Bun.plugin({
    name: 'tada-stylesheet-stub',
    setup(build) {
      build.onLoad({ filter: /\.s?css$/ }, () => ({
        contents: '',
        loader: 'js',
      }));
    },
  });
}

// Bun keeps every module it imports. Forgetting the ones in src/ makes the
// next import read them again, so watch mode runs the latest code;
// packages in node_modules stay loaded, since watch mode doesn't watch them.
function forgetSrcModules(srcDir: string): void {
  const realSrcDir = realPath(srcDir);
  for (const key of Object.keys(require.cache)) {
    if (isInside(realSrcDir, key) || isInside(srcDir, key)) {
      delete require.cache[key];
    }
  }
}

/**
 * Imports the renderer modules of the listed scripts and returns their render
 * functions, keyed by script. It needs only the script list, so it can run
 * while the scripts compile.
 */
export async function loadAuthorRenderers(
  scripts: readonly string[],
  srcDir: string,
  projectDir: string,
): Promise<Map<string, ScriptRenderers>> {
  const loaded = new Map<string, ScriptRenderers>();
  const files = findRenderers(scripts, srcDir, projectDir);
  if (files.size === 0) {
    return loaded;
  }
  registerStylesheetStub();
  forgetSrcModules(srcDir);
  for (const [script, filePath] of files) {
    const file = toPosix(path.relative(projectDir, filePath));
    let module: Record<string, unknown>;
    try {
      module = await import(pathToFileURL(filePath).href);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`${file}: failed to load: ${message}`, { cause: error });
    }
    loaded.set(script, validateRendererModule(module, file));
  }
  return loaded;
}

/** Adds loaded renderers, if any, to a build's compiled scripts */
export function withRenderers(
  authorScripts: AuthorScripts,
  renderers: ReadonlyMap<string, ScriptRenderers>,
): AuthorScripts {
  return renderers.size > 0 ? { ...authorScripts, renderers } : authorScripts;
}
