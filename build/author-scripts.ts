import fs from 'fs';
import path from 'path';
import type { PluginBuilder } from 'bun';
import { isInside, toPosix } from './utils/paths';
import {
  createScssPlugin,
  normalizeBundlePath,
  readBuildOutputs,
  runBuild,
} from './bundle';
import { isValidPublicAssetPath } from './custom-fonts';

/** The output directory for compiled author scripts and their styles */
export const AUTHOR_SCRIPTS_DIR = '_scripts';

const SCRIPT_PATH_ERROR =
  'must be a src-relative POSIX path ending in .ts or .js';

/** Output paths for one script listed in `scripts` */
export interface AuthorScriptOutputs {
  js: string;
  css: string[];
}

/** The compiled `src/` scripts of one build */
export interface AuthorScripts {
  /** The scripts the build was asked for, including any that don't exist */
  requested: string[];
  /** Every compiled file, keyed by output path */
  outputs: Map<string, string | Uint8Array>;
  /** Each listed script that was compiled, keyed by its path in `src/` */
  entries: Map<string, AuthorScriptOutputs>;
}

export function createEmptyAuthorScripts(
  requested: string[] = [],
): AuthorScripts {
  return { requested, outputs: new Map(), entries: new Map() };
}

/** Why a `scripts` item can't name a script in `src/`, or null */
export function getScriptPathError(value: unknown): string | null {
  if (typeof value !== 'string') {
    return 'must be a string';
  }
  if (!isValidPublicAssetPath(value) || !/\.(ts|js)$/.test(value)) {
    return SCRIPT_PATH_ERROR;
  }
  return null;
}

/** Problems with the site config `scripts` list, as messages */
export function validateSiteScripts(
  scripts: readonly unknown[] | undefined,
  exists: (script: string) => boolean,
): string[] {
  const messages: string[] = [];
  for (const [index, value] of (scripts ?? []).entries()) {
    const error = getScriptPathError(value);
    if (error) {
      messages.push(`scripts[${index}] "${value}" ${error}`);
    } else if (!exists(value as string)) {
      messages.push(`scripts[${index}] "${value}" not found in src/`);
    }
  }
  return messages;
}

/** Whether `script` names a file in `srcDir` */
export function scriptExists(srcDir: string, script: string): boolean {
  return (
    fs
      .statSync(path.join(srcDir, ...script.split('/')), {
        throwIfNoEntry: false,
      })
      ?.isFile() ?? false
  );
}

/**
 * Lists the scripts a page loads: site-wide scripts first, then the page's
 * own, each once. Throws for a malformed front matter value.
 */
export function getPageScripts(
  siteScripts: readonly string[] | undefined,
  pageScripts: unknown,
  label: string,
): string[] {
  // `scripts:` with no value is null
  if (pageScripts != null && !Array.isArray(pageScripts)) {
    throw new Error(`${label}: front matter "scripts" must be a list of paths`);
  }
  const scripts = new Set(siteScripts ?? []);
  for (const [index, value] of (pageScripts ?? []).entries()) {
    const error = getScriptPathError(value);
    if (error) {
      throw new Error(`${label}: scripts[${index}] "${value}" ${error}`);
    }
    scripts.add(value as string);
  }
  return [...scripts];
}

/**
 * Lists every well-formed script path that pages or the site config name, in
 * first-seen order. Malformed values are reported when their page renders.
 */
export function collectScriptEntries(
  siteScripts: readonly string[] | undefined,
  pageScriptLists: Iterable<unknown>,
): string[] {
  const entries = new Set<string>();
  for (const list of [siteScripts, ...pageScriptLists]) {
    if (!Array.isArray(list)) {
      continue;
    }
    for (const value of list) {
      if (getScriptPathError(value) === null) {
        entries.add(value);
      }
    }
  }
  return [...entries];
}

/** Compiled JavaScript and CSS output paths, in the order a page loads them */
export interface PageAuthorAssets {
  js: string[];
  css: string[];
}

/** The compiled JavaScript and CSS output paths for a page's scripts */
export function getPageAuthorAssets(
  authorScripts: AuthorScripts,
  scripts: readonly string[],
  label: string,
): PageAuthorAssets {
  const js: string[] = [];
  const css = new Set<string>();
  for (const script of scripts) {
    const outputs = authorScripts.entries.get(script);
    if (!outputs) {
      throw new Error(`${label}: script "${script}" not found in src/`);
    }
    js.push(outputs.js);
    for (const file of outputs.css) {
      css.add(file);
    }
  }
  return { js, css: [...css] };
}

// Files Bun compiles into modules: the only files a script can import
const MODULE_EXTENSIONS = new Set([
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.ts',
  '.tsx',
  '.mts',
  '.cts',
  '.json',
  '.jsonc',
  '.toml',
  '.yaml',
  '.yml',
  '.txt',
  '.css',
  '.scss',
]);

const JS_IMPORT_KINDS = new Set([
  'import-statement',
  'dynamic-import',
  'require-call',
]);

const FILE_IMPORT_ERROR =
  'scripts can import code, stylesheets, and JSON, TOML, YAML, or text files; put files in content/ or public/ and refer to them by URL';

// A file a script imports, as Bun would find it, or null if it can't be found
function resolveImport(specifier: string, importer: string): string | null {
  try {
    return Bun.resolveSync(specifier, path.dirname(importer));
  } catch {
    // Bun reports the import it can't resolve
    return null;
  }
}

function isInSrc(srcDir: string, filePath: string): boolean {
  return isInside(srcDir, realPath(filePath));
}

function outsideSrcError(specifier: string, advice: string): Error {
  return new Error(`"${specifier}" is outside src/; ${advice}`);
}

const STYLESHEET_IMPORT_ADVICE = 'stylesheets can only import files in src/';

const SCRIPT_IMPORT_ADVICE =
  'scripts can only import relative files in src/, which watch mode recompiles when they change';

/**
 * Keeps scripts and their stylesheets to files in `src/`, plus packages that
 * scripts import by name. Images and other files belong in content/ or
 * public/, which publish them at stable URLs. Absolute stylesheet URLs, such
 * as `url(/images/paper.png)`, are left for the browser.
 */
function createImportCheckPlugin(srcDir: string) {
  return {
    name: 'tada-import-check',
    setup(build: PluginBuilder) {
      build.onResolve({ filter: /.*/ }, args => {
        if (JS_IMPORT_KINDS.has(args.kind)) {
          // Compared without resolving links, so a directory in src/ that
          // links elsewhere still counts as src/. Files outside src/, such as
          // a package's own modules, import what they like.
          if (
            /^\.\.?\//.test(args.path) &&
            isInside(srcDir, args.importer) &&
            !isInside(
              srcDir,
              path.resolve(path.dirname(args.importer), args.path),
            )
          ) {
            throw outsideSrcError(args.path, SCRIPT_IMPORT_ADVICE);
          }
          // The resolved file decides, since a name like `./site.config` or
          // `lodash.debounce` is not a file extension
          const resolved = resolveImport(args.path, args.importer);
          const ext = resolved ? path.extname(resolved).toLowerCase() : '';
          if (ext && !MODULE_EXTENSIONS.has(ext)) {
            throw new Error(
              `cannot import "${args.path}": ${FILE_IMPORT_ERROR}`,
            );
          }
          return undefined;
        }
        const isUrl = args.kind === 'internal';
        if (!isUrl && args.kind !== 'import-rule') {
          return undefined;
        }
        if (isUrl && /^\/(?!\/)/.test(args.path)) {
          return { path: args.path, external: true };
        }
        if (
          /^\.\.?\//.test(args.path) &&
          !isInSrc(srcDir, path.resolve(path.dirname(args.importer), args.path))
        ) {
          throw outsideSrcError(
            args.path,
            isUrl
              ? 'put files in content/ or public/ and use an absolute URL'
              : STYLESHEET_IMPORT_ADVICE,
          );
        }
        return undefined;
      });
    },
  };
}

// Sass reads partials itself, so its imports are checked after compiling
function checkSassImports(srcDir: string) {
  return (scssPath: string, loadedPaths: string[]) => {
    for (const loaded of loadedPaths) {
      if (!isInSrc(srcDir, loaded)) {
        throw outsideSrcError(
          toPosix(path.relative(path.dirname(scssPath), loaded)),
          STYLESHEET_IMPORT_ADVICE,
        );
      }
    }
  };
}

// Absolute stylesheet URLs are written without the base path, like absolute
// links in pages
function addBasePathToCssUrls(css: string, basePath: string): string {
  const base = basePath.replace(/\/$/, '');
  if (!base) {
    return css;
  }
  return css.replace(
    /url\(\s*(["']?)\/(?!\/)/g,
    (_, quote: string) => `url(${quote}${base}/`,
  );
}

function realPath(filePath: string): string {
  try {
    return fs.realpathSync(filePath);
  } catch {
    return filePath;
  }
}

/**
 * Compiles the listed scripts in `srcDir` and everything they import into one
 * set of ES modules. Shared imports become chunks. Scripts that don't exist
 * are left out, so the pages that list them report the error.
 */
export async function bundleAuthorScripts(
  scripts: readonly string[],
  srcDir: string,
  mode: 'development' | 'production',
  basePath: string,
): Promise<AuthorScripts> {
  const existing = scripts.filter(script => scriptExists(srcDir, script));
  if (existing.length === 0) {
    return createEmptyAuthorScripts([...scripts]);
  }

  // Bun reports entry points by their real paths, so match on those in case
  // src/ or a directory in it is a symbolic link
  const scriptByRealPath = new Map(
    existing.map(script => [
      realPath(path.join(srcDir, ...script.split('/'))),
      script,
    ]),
  );
  const isDev = mode === 'development';
  const hash = isDev ? '' : '-[hash]';
  const result = await runBuild({
    entrypoints: existing.map(script =>
      path.join(srcDir, ...script.split('/')),
    ),
    root: srcDir,
    format: 'esm',
    target: 'browser',
    splitting: true,
    minify: !isDev,
    sourcemap: isDev ? 'inline' : 'none',
    metafile: true,
    naming: {
      entry: `${AUTHOR_SCRIPTS_DIR}/[dir]/[name]${hash}.[ext]`,
      chunk: `${AUTHOR_SCRIPTS_DIR}/chunks/[name]-[hash].[ext]`,
      asset: `${AUTHOR_SCRIPTS_DIR}/[dir]/[name]-[hash].[ext]`,
    },
    plugins: [
      createScssPlugin([], checkSassImports(realPath(srcDir))),
      createImportCheckPlugin(realPath(srcDir)),
    ],
  });

  // Entry points are reported relative to the working directory
  const scriptFor = (entryPoint: string) =>
    scriptByRealPath.get(realPath(path.resolve(entryPoint)));
  // Bun names outputs by real paths, so a script in a directory that links
  // outside src/ would be written outside _scripts/
  for (const [outputPath, output] of Object.entries(
    result.metafile?.outputs ?? {},
  )) {
    if (!normalizeBundlePath(outputPath).startsWith(`${AUTHOR_SCRIPTS_DIR}/`)) {
      const script = output.entryPoint && scriptFor(output.entryPoint);
      throw new Error(
        `${script ? `src/${script}` : outputPath}: its real path is outside src/, such as through a symbolic link; listed scripts must be in src/`,
      );
    }
  }

  const entries = new Map<string, AuthorScriptOutputs>();
  for (const [outputPath, output] of Object.entries(
    result.metafile?.outputs ?? {},
  )) {
    if (!output.entryPoint || !outputPath.endsWith('.js')) {
      continue;
    }
    const script = scriptFor(output.entryPoint);
    if (script === undefined) {
      continue;
    }
    entries.set(script, {
      js: normalizeBundlePath(outputPath),
      css: output.cssBundle ? [normalizeBundlePath(output.cssBundle)] : [],
    });
  }
  const outputs = await readBuildOutputs(result);
  for (const [outputPath, content] of outputs) {
    if (outputPath.endsWith('.css') && typeof content === 'string') {
      outputs.set(outputPath, addBasePathToCssUrls(content, basePath));
    }
  }
  return { requested: [...scripts], outputs, entries };
}
