import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { compileTemplate } from './lodash-template';
import * as sass from 'sass';
import { getPackageDir, toPosix } from './utils/paths';
import { deriveTheme } from './utils/derive-theme';
import type { PluginBuilder } from 'bun';
import type { SiteVariables } from './types';
import pkg from '../package.json' with { type: 'json' };
import {
  getSerifFontStack,
  getSerifMonoFontStack,
  renderCustomFontFaceScss,
  renderCustomFontTuningScss,
  renderFontFeatureSettings,
} from './custom-fonts';

interface BunBuildPlugin {
  name: string;
  setup(build: PluginBuilder): void;
}

interface CoverageHooks {
  createBundlePlugin(): BunBuildPlugin;
}

interface CoverageGlobal {
  __tadaCoverage?: CoverageHooks;
}

function getBundleNaming(): string {
  const version = pkg.version.replace(/[^a-zA-Z0-9.-]/g, '-');
  return `[name].bundle.tada-${version}.[ext]`;
}

// Returns the rendered SCSS source of the theme module (`config/theme`)
function renderThemeScss(siteVariables: SiteVariables): string {
  const templatePath = path.join(getPackageDir(), 'templates/_theme.scss');
  const template = fs.readFileSync(templatePath, 'utf-8');
  const theme = deriveTheme(siteVariables.themeColor);
  const tintHue = siteVariables.tintHue ?? 190;
  const tintAmount = siteVariables.tintAmount ?? 100;

  const customFontFaces = renderCustomFontFaceScss(siteVariables.fontOverrides);
  const customFontTuning = renderCustomFontTuningScss(
    siteVariables.fontOverrides,
  );

  const renderedTemplate = compileTemplate(template)({
    ...theme,
    tintHue,
    tintAmount,
    serifFontStack: getSerifFontStack(siteVariables.fontOverrides),
    serifMonoFontStack: getSerifMonoFontStack(siteVariables.fontOverrides),
    serifFontFeatureSettings: renderFontFeatureSettings(
      siteVariables.fontOverrides?.serif,
    ),
    serifMonoFontFeatureSettings: renderFontFeatureSettings(
      siteVariables.fontOverrides?.serifMono,
    ),
  });
  const rendered = renderedTemplate
    .replace('/* TADA_CUSTOM_FONT_FACES */', customFontFaces)
    .replace('/* TADA_CUSTOM_FONT_TUNING */', customFontTuning);

  return rendered;
}

function createDefine(
  siteVariables: SiteVariables,
  isDev = false,
): Record<string, string> {
  return {
    __SITE_BASE_PATH__: JSON.stringify(siteVariables.basePath),
    __SITE_TITLE_POSTFIX__: JSON.stringify(siteVariables.titlePostfix),
    __IS_DEV__: JSON.stringify(isDev),
  };
}

const THEME_MODULE_URL = 'config/theme';
const THEME_CANONICAL_URL = 'tada:config/theme';

// Serves the rendered theme from memory to `@use 'config/theme'`
function createThemeImporter(themeScss: string): sass.Importer<'sync'> {
  return {
    canonicalize(url) {
      return url === THEME_MODULE_URL ? new URL(THEME_CANONICAL_URL) : null;
    },
    load(canonicalUrl) {
      if (canonicalUrl.href !== THEME_CANONICAL_URL) {
        return null;
      }
      return { contents: themeScss, syntax: 'scss' };
    },
  };
}

/**
 * Compiles imported `.scss` files with the given Sass importers. `checkLoaded`
 * receives each compiled file and every file Sass read for it, and can throw
 * to fail the build.
 */
export function createScssPlugin(
  importers: sass.Importer<'sync'>[] = [],
  checkLoaded?: (scssPath: string, loadedPaths: string[]) => void,
) {
  return {
    name: 'scss',
    setup(build: PluginBuilder) {
      build.onLoad({ filter: /\.scss$/ }, args => {
        const result = sass.compile(args.path, { importers });
        checkLoaded?.(
          args.path,
          result.loadedUrls
            .filter(url => url.protocol === 'file:')
            .map(url => fileURLToPath(url)),
        );
        return { contents: result.css, loader: 'css' as const };
      });
    },
  };
}

function getCoverageBundlePlugin(): BunBuildPlugin | null {
  return (
    (globalThis as CoverageGlobal).__tadaCoverage?.createBundlePlugin() ?? null
  );
}

/** Normalizes an output path reported by Bun, such as `./a/./b.js` */
export function normalizeBundlePath(outputPath: string): string {
  return path.posix.normalize(toPosix(outputPath));
}

/** A failed Bun.build, with one message per error */
export class BundleError extends Error {
  constructor(readonly messages: string[]) {
    super(`Bundle failed:\n${messages.join('\n')}`);
  }
}

// Names the file and position of a build error, such as a syntax error
function formatBuildLog(log: Bun.BuildOutput['logs'][number]): string {
  const message = log.message || String(log);
  const position = 'position' in log ? log.position : null;
  if (!position?.file) {
    return message;
  }
  // Errors from plugins have no line
  return position.line > 0
    ? `${position.file}:${position.line}:${position.column}: ${message}`
    : `${position.file}: ${message}`;
}

/** Runs Bun.build and throws its errors as a BundleError */
export async function runBuild(
  options: Parameters<typeof Bun.build>[0],
): Promise<Bun.BuildOutput> {
  const result = await Bun.build({ ...options, throw: false });
  if (!result.success) {
    throw new BundleError(
      result.logs.filter(log => log.level === 'error').map(formatBuildLog),
    );
  }
  return result;
}

// Text outputs stay strings; anything else, such as an imported image, keeps
// its exact bytes
function isTextOutput(output: Bun.BuildArtifact): boolean {
  return /^text\/|javascript|json/.test(output.type);
}

/** Reads each build output, keyed by normalized output path */
export async function readBuildOutputs(
  result: Bun.BuildOutput,
): Promise<Map<string, string | Uint8Array>> {
  const outputs = new Map<string, string | Uint8Array>();
  for (const output of result.outputs) {
    outputs.set(
      normalizeBundlePath(output.path),
      isTextOutput(output)
        ? await output.text()
        : new Uint8Array(await output.arrayBuffer()),
    );
  }
  return outputs;
}

async function buildToMemory(
  options: Parameters<typeof Bun.build>[0],
): Promise<Map<string, string | Uint8Array>> {
  return readBuildOutputs(await runBuild(options));
}

/** Bundles Tada's client CSS and JavaScript, keyed by output path */
export function bundle(
  siteVariables: SiteVariables,
  { mode = 'development' }: { mode?: string } = {},
): Promise<Map<string, string | Uint8Array>> {
  const isDev = mode === 'development';
  const plugins = [
    createScssPlugin([createThemeImporter(renderThemeScss(siteVariables))]),
  ];
  const coverageBundlePlugin = getCoverageBundlePlugin();
  if (coverageBundlePlugin) {
    plugins.push(coverageBundlePlugin);
  }

  return buildToMemory({
    entrypoints: [path.resolve(getPackageDir(), 'src/index.ts')],
    naming: getBundleNaming(),
    minify: mode === 'production',
    sourcemap: isDev ? 'inline' : 'none',
    define: createDefine(siteVariables, isDev),
    external: ['*.woff2'],
    plugins,
  });
}

/** Bundles the watch-mode reload client, keyed by output path */
export function bundleReloadClient(): Promise<
  Map<string, string | Uint8Array>
> {
  return buildToMemory({
    entrypoints: [
      path.resolve(getPackageDir(), 'build/watch-reload-client.ts'),
    ],
    naming: getBundleNaming(),
    sourcemap: 'inline',
  });
}

export { renderThemeScss };
