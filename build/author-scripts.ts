import fs from 'fs';
import path from 'path';
import type { PluginBuilder } from 'bun';
import * as sass from 'sass';
import {
  isInside,
  isValidPublicAssetPath,
  realPath,
  toDisplayPath,
  toPosix,
} from './utils/paths';
import {
  createScssPlugin,
  normalizeBundlePath,
  readBuildOutputs,
  runBuild,
  type BuildLog,
} from './bundle';
import {
  findPackageDir,
  getMissingPackageReason,
  isNpmSpecifier,
  NPM_PREFIX,
  parseNpmSpecifier,
} from './packages';

/** The output directory for compiled author scripts and their styles */
export const AUTHOR_SCRIPTS_DIR = '_scripts';

const SCRIPT_PATH_ERROR =
  'must be a src-relative POSIX path ending in .ts or .js';

const NPM_SCRIPT_ERROR =
  'must name an npm package, such as npm:name or npm:@scope/name/path';

const OUTSIDE_SRC_SCRIPT_ERROR =
  'its real path is outside src/, such as through a symbolic link; listed scripts must be in src/';

/**
 * Starts the names of package scripts' entry modules, which Tada writes in
 * memory at the top of `src/`
 */
const PACKAGE_ENTRY_PREFIX = '_npm~';

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
  /**
   * Each listed script that was compiled, keyed by its path in `src/` or its
   * `npm:` path
   */
  entries: Map<string, AuthorScriptOutputs>;
  /** Why each requested script that was not compiled can't be found */
  missing?: Map<string, string>;
}

export function createEmptyAuthorScripts(
  requested: string[] = [],
  missing: Map<string, string> = new Map(),
): AuthorScripts {
  return { requested, outputs: new Map(), entries: new Map(), missing };
}

/**
 * Why a `scripts` item can't name a script in `src/` or a package, or null
 */
export function getScriptPathError(value: unknown): string | null {
  if (typeof value !== 'string') {
    return 'must be a string';
  }
  if (isNpmSpecifier(value)) {
    return parseNpmSpecifier(value) ? null : NPM_SCRIPT_ERROR;
  }
  if (!isValidPublicAssetPath(value) || !/\.(ts|js)$/.test(value)) {
    return SCRIPT_PATH_ERROR;
  }
  if (value.startsWith(PACKAGE_ENTRY_PREFIX)) {
    return `must not start with ${PACKAGE_ENTRY_PREFIX}, which Tada uses for packages`;
  }
  return null;
}

/** Problems with the site config `scripts` list, as messages */
export function validateSiteScripts(
  scripts: readonly unknown[] | undefined,
  findProblem: (script: string) => string | null,
): string[] {
  const messages: string[] = [];
  for (const [index, value] of (scripts ?? []).entries()) {
    const problem = getScriptPathError(value) ?? findProblem(value as string);
    if (problem) {
      messages.push(`scripts[${index}] "${value}" ${problem}`);
    }
  }
  return messages;
}

/**
 * Why a well-formed script can't be found, or null if it can: a file in
 * `src/`, or a package that is installed. Which modules a package exports is
 * left to the bundler, which resolves them for browsers.
 */
export function findScriptProblem(
  script: string,
  srcDir: string,
  projectDir: string,
): string | null {
  const specifier = parseNpmSpecifier(script);
  if (!specifier) {
    return scriptExists(srcDir, script) ? null : 'not found in src/';
  }
  return findPackageDir(specifier.name, projectDir)
    ? null
    : getMissingPackageReason(specifier.name);
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
      const problem = authorScripts.missing?.get(script) ?? 'not found in src/';
      throw new Error(`${label}: script "${script}" ${problem}`);
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

/**
 * Whether a file belongs to an installed package, such as a library's own
 * stylesheet: it is in a `node_modules` directory where packages are found,
 * and not one of the site's own files, even if the site itself is in a
 * `node_modules` directory
 */
function isPackageFile(projectDir: string, filePath: string): boolean {
  if (isInside(projectDir, filePath)) {
    return isInside(path.join(projectDir, 'node_modules'), filePath);
  }
  for (let dir = path.dirname(projectDir); ; dir = path.dirname(dir)) {
    if (isInside(path.join(dir, 'node_modules'), filePath)) {
      return true;
    }
    if (path.dirname(dir) === dir) {
      return false;
    }
  }
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
 * as `url(/images/paper.png)`, are left for the browser. A package's own
 * stylesheets can refer to any of its files, such as a library's images.
 */
function createImportCheckPlugin(srcDir: string, projectDir: string) {
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
          !isPackageFile(projectDir, args.importer) &&
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

// Sass reads partials itself, so its imports are checked after compiling.
// Stylesheets can load files in src/ and in packages, such as with
// `@use 'pkg:name/path'`.
function checkSassImports(srcDir: string, projectDir: string) {
  return (scssPath: string, loadedPaths: string[]) => {
    for (const loaded of loadedPaths) {
      if (!isInSrc(srcDir, loaded) && !isPackageFile(projectDir, loaded)) {
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

/**
 * The file Bun compiles for a script: its file in `src/`, or for a package, a
 * module that exists only in memory and re-exports the package's default
 * export. That module keeps package outputs in `_scripts/` and lets them share
 * chunks with the site's own scripts. It is at the top of `rootDir`, since Bun
 * misnames outputs in directories that don't exist, so its name flattens the
 * package path, such as `_npm~@scope~name~path.js`.
 */
function getEntryPath(rootDir: string, script: string): string {
  if (!isNpmSpecifier(script)) {
    return path.join(rootDir, ...script.split('/'));
  }
  const name = script.slice(NPM_PREFIX.length).replaceAll('/', '~');
  return path.join(rootDir, `${PACKAGE_ENTRY_PREFIX}${name}.js`);
}

// A namespace import, so a package without a default export is loaded but not
// mounted, like a script in src/
function renderPackageEntry(script: string): string {
  const specifier = JSON.stringify(script.slice(NPM_PREFIX.length));
  return `import * as module from ${specifier};\nexport default module.default;\n`;
}

/** Serves package scripts' in-memory entry modules, keyed by path */
function createPackageEntryPlugin(entries: ReadonlyMap<string, string>) {
  return {
    name: 'tada-package-entries',
    setup(build: PluginBuilder) {
      build.onResolve({ filter: /.*/ }, args =>
        entries.has(args.path) ? { path: args.path } : undefined,
      );
      build.onLoad({ filter: /\.js$/ }, args => {
        const contents = entries.get(args.path);
        return contents === undefined
          ? undefined
          : { contents, loader: 'js' as const };
      });
    },
  };
}

/**
 * Compiles the listed scripts in `srcDir` and packages, and everything they
 * import, into one set of ES modules. Shared imports become chunks. Scripts
 * that can't be found are left out, so the pages that list them report the
 * error.
 */
export async function bundleAuthorScripts(
  scripts: readonly string[],
  srcDir: string,
  projectDir: string,
  mode: 'development' | 'production',
  basePath: string,
): Promise<AuthorScripts> {
  const missing = new Map<string, string>();
  for (const script of scripts) {
    const problem = findScriptProblem(script, srcDir, projectDir);
    if (problem) {
      missing.set(script, problem);
    }
  }
  const existing = scripts.filter(script => !missing.has(script));
  if (existing.length === 0) {
    return createEmptyAuthorScripts([...scripts], missing);
  }

  // Bun needs its root directory to exist; a site can list package scripts
  // without having src/
  const rootDir = fs.existsSync(srcDir) ? srcDir : projectDir;
  // Bun reports entry points by their real paths, so match on those in case
  // src/ or a directory in it is a symbolic link. Package entries exist only
  // in memory, so they are matched by the path Tada gave them.
  const scriptByRealPath = new Map<string, string>();
  const packageEntries = new Map<string, string>();
  for (const script of existing) {
    const entryPath = getEntryPath(rootDir, script);
    if (isNpmSpecifier(script)) {
      const other = scriptByRealPath.get(entryPath);
      if (other !== undefined) {
        throw new Error(
          `scripts "${other}" and "${script}" can't both be compiled, since their names are the same with / replaced by ~`,
        );
      }
      // The plugin would serve the package entry in place of the file
      if (fs.existsSync(entryPath)) {
        throw new Error(
          `${toDisplayPath(entryPath)}: Tada compiles "${script}" from this path; rename the file`,
        );
      }
      packageEntries.set(entryPath, renderPackageEntry(script));
      scriptByRealPath.set(entryPath, script);
    } else {
      // Checked before building, since only some Bun versions name the
      // output of such a script outside _scripts/
      const entryRealPath = realPath(entryPath);
      if (!isInside(realPath(srcDir), entryRealPath)) {
        throw new Error(`src/${script}: ${OUTSIDE_SRC_SCRIPT_ERROR}`);
      }
      scriptByRealPath.set(entryRealPath, script);
    }
  }
  const isDev = mode === 'development';
  const hash = isDev ? '' : '-[hash]';
  // A package entry only imports the package, so an error in it means the
  // package doesn't export the module, rather than a missing package
  const describePackageEntryError = (log: BuildLog) => {
    const file = 'position' in log ? log.position?.file : undefined;
    const entryPath = file ? path.resolve(file) : undefined;
    if (!entryPath || !packageEntries.has(entryPath)) {
      return undefined;
    }
    const script = scriptByRealPath.get(entryPath)!;
    const name = parseNpmSpecifier(script)!.name;
    return `script "${script}" is not exported by package "${name}"`;
  };
  const result = await runBuild(
    {
      entrypoints: existing.map(script => getEntryPath(rootDir, script)),
      root: rootDir,
      format: 'esm',
      target: 'browser',
      splitting: true,
      minify: !isDev,
      sourcemap: isDev ? 'inline' : 'none',
      metafile: true,
      naming: {
        entry: `${AUTHOR_SCRIPTS_DIR}/[dir]/[name]${hash}.[ext]`,
        chunk: `${AUTHOR_SCRIPTS_DIR}/chunks/[name]-[hash].[ext]`,
        // Not by directory, since files in packages are outside src/
        asset: `${AUTHOR_SCRIPTS_DIR}/assets/[name]-[hash].[ext]`,
      },
      plugins: [
        createPackageEntryPlugin(packageEntries),
        createScssPlugin(
          [new sass.NodePackageImporter(projectDir)],
          checkSassImports(realPath(srcDir), projectDir),
        ),
        createImportCheckPlugin(realPath(srcDir), projectDir),
      ],
    },
    describePackageEntryError,
  );

  // Entry points are reported relative to the working directory
  const scriptFor = (entryPoint: string) =>
    scriptByRealPath.get(realPath(path.resolve(entryPoint)));
  // A backstop: Bun names outputs by real paths, so a file that links outside
  // src/ could be written outside _scripts/
  for (const [outputPath, output] of Object.entries(
    result.metafile?.outputs ?? {},
  )) {
    if (!normalizeBundlePath(outputPath).startsWith(`${AUTHOR_SCRIPTS_DIR}/`)) {
      const script = output.entryPoint && scriptFor(output.entryPoint);
      throw new Error(
        `${script ? `src/${script}` : outputPath}: ${OUTSIDE_SRC_SCRIPT_ERROR}`,
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
  return { requested: [...scripts], outputs, entries, missing };
}
