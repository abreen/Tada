import fs from 'fs';
import path from 'path';
import { compileTemplate } from './lodash-template';
import * as sass from 'sass';
import { getPackageDir, toPosix } from './utils/paths';
import {
  deriveTheme,
  deriveLinkHue,
  deriveTraceLineActiveHue,
} from './utils/derive-theme';
import type { PluginBuilder } from 'bun';
import type { SiteVariables } from './types';
import timezones from '../src/timezone/timezones.json' with { type: 'json' };
import pkg from '../package.json' with { type: 'json' };
import { renderMaterialSymbolVariables } from './material-symbols';
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

function formatCssNumber(value: number, precision = 4): string {
  if (Number.isInteger(value)) {
    return String(value);
  }

  return value.toFixed(precision).replace(/\.?0+$/, '');
}

// Returns the rendered SCSS source of the theme module (`config/theme`)
function renderThemeScss(siteVariables: SiteVariables): string {
  const templatePath = path.join(getPackageDir(), 'templates/_theme.scss');
  const template = fs.readFileSync(templatePath, 'utf-8');
  const theme = deriveTheme(siteVariables.themeColor);
  const tintHue = siteVariables.tintHue ?? 33;
  const tintAmount = siteVariables.tintAmount ?? 100;

  const linkHue = formatCssNumber(deriveLinkHue(tintHue));
  const linkColor = `hsl(${linkHue}deg 66% 38%)`;
  const linkColorHover = `hsl(${linkHue}deg 56% 49%)`;
  const linkColorDark = `hsl(${linkHue}deg 50% 72%)`;
  const linkColorHoverDark = `hsl(${linkHue}deg 40% 80%)`;
  const traceLineActiveHue = formatCssNumber(deriveTraceLineActiveHue(tintHue));
  const bgTraceLineActive = `hsl(${traceLineActiveHue}deg 100% 86%)`;
  const bgTraceLineActiveDark = `hsl(${traceLineActiveHue}deg 90% 18%)`;
  const materialSymbolVariables = renderMaterialSymbolVariables();
  const customFontFaces = renderCustomFontFaceScss(siteVariables.fontOverrides);
  const customFontTuning = renderCustomFontTuningScss(
    siteVariables.fontOverrides,
  );

  const renderedTemplate = compileTemplate(template)({
    ...theme,
    tintHue,
    tintAmount,
    linkColor,
    linkColorHover,
    linkColorDark,
    linkColorHoverDark,
    bgTraceLineActive,
    bgTraceLineActiveDark,
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
    .replace('/* TADA_CUSTOM_FONT_TUNING */', customFontTuning)
    .replace('/* TADA_MATERIAL_SYMBOL_VARIABLES */', materialSymbolVariables);

  return rendered;
}

function createDefine(
  siteVariables: SiteVariables,
  isDev = false,
): Record<string, string> {
  return {
    __SITE_BASE_PATH__: JSON.stringify(siteVariables.basePath),
    __SITE_TITLE_POSTFIX__: JSON.stringify(siteVariables.titlePostfix),
    __SITE_DEFAULT_TIMEZONE__: JSON.stringify(siteVariables.defaultTimeZone),
    __SITE_TIMEZONES__: JSON.stringify(timezones),
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

function createScssPlugin(themeScss: string) {
  const importers = [createThemeImporter(themeScss)];
  return {
    name: 'scss',
    setup(build: PluginBuilder) {
      build.onLoad({ filter: /\.scss$/ }, args => {
        const result = sass.compile(args.path, { importers });
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

async function buildToMemory(
  options: Parameters<typeof Bun.build>[0],
): Promise<Map<string, string>> {
  const result = await Bun.build(options);
  if (!result.success) {
    const messages = result.logs
      .filter(log => log.level === 'error')
      .map(log => log.message || String(log));
    throw new Error(`Bundle failed:\n${messages.join('\n')}`);
  }
  const outputs = new Map<string, string>();
  for (const output of result.outputs) {
    outputs.set(
      path.posix.normalize(toPosix(output.path)),
      await output.text(),
    );
  }
  return outputs;
}

/** Bundles Tada's client CSS and JavaScript, keyed by output path */
export function bundle(
  siteVariables: SiteVariables,
  { mode = 'development' }: { mode?: string } = {},
): Promise<Map<string, string>> {
  const isDev = mode === 'development';
  const plugins = [createScssPlugin(renderThemeScss(siteVariables))];
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
export function bundleReloadClient(): Promise<Map<string, string>> {
  return buildToMemory({
    entrypoints: [
      path.resolve(getPackageDir(), 'build/watch-reload-client.ts'),
    ],
    naming: getBundleNaming(),
    sourcemap: 'inline',
  });
}

export { renderThemeScss };
