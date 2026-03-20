import fs from 'fs';
import os from 'os';
import path from 'path';
import _ from 'lodash';
import * as sass from 'sass';
import { getPackageDir, getProjectDir, getDistDir } from './utils/paths.js';
import { deriveTheme } from './utils/derive-theme.js';
import type { PluginBuilder } from 'bun';
import type { SiteVariables } from './types.js';
import timezones from '../src/timezone/timezones.json' with { type: 'json' };

function renderThemeScss(siteVariables: SiteVariables): string {
  const templatePath = path.join(getPackageDir(), 'templates/_theme.scss');
  const template = fs.readFileSync(templatePath, 'utf-8');
  const theme = deriveTheme(siteVariables.themeColor!);
  const tintHue = siteVariables.tintHue ?? 20;
  const tintAmount = siteVariables.tintAmount ?? 100;

  const iconColor = `hsl(${tintHue}deg ${(8 * tintAmount) / 100}% 8%)`;
  const iconColorHover = `hsl(${tintHue}deg ${(6 * tintAmount) / 100}% 60%)`;
  const iconColorDark = `hsl(${tintHue}deg ${(20 * tintAmount) / 100}% 90%)`;
  const iconColorHoverDark = `hsl(${tintHue}deg ${(6 * tintAmount) / 100}% 55%)`;
  const iconColorTranslucentDark = `hsl(${tintHue}deg ${(85 * tintAmount) / 100}% 90%)`;

  const rendered = _.template(template)({
    ...theme,
    tintHue,
    tintAmount,
    iconColor,
    iconColorHover,
    iconColorDark,
    iconColorHoverDark,
    iconColorTranslucentDark,
  });

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tada-'));
  const configDir = path.join(tmpDir, 'config');
  fs.mkdirSync(configDir);
  fs.writeFileSync(path.join(configDir, '_theme.scss'), rendered);

  return tmpDir;
}

function createDefine(
  siteVariables: SiteVariables,
  isDev = false,
): Record<string, string> {
  return {
    'window.siteVariables.base': JSON.stringify(siteVariables.base),
    'window.siteVariables.basePath': JSON.stringify(siteVariables.basePath),
    'window.siteVariables.titlePostfix': JSON.stringify(
      siteVariables.titlePostfix,
    ),
    'window.siteVariables.defaultTimeZone': JSON.stringify(
      siteVariables.defaultTimeZone,
    ),
    'window.siteVariables.timezones': JSON.stringify(timezones),
    'window.IS_DEV': JSON.stringify(isDev),
  };
}

function createScssPlugin(siteVariables: SiteVariables) {
  const themeDir = renderThemeScss(siteVariables);

  return {
    name: 'scss',
    setup(build: PluginBuilder) {
      build.onLoad({ filter: /\.scss$/ }, args => {
        const result = sass.compile(args.path, {
          loadPaths: [themeDir, getProjectDir()],
        });
        return { contents: result.css, loader: 'css' as const };
      });
    },
  };
}

export async function bundle(
  siteVariables: SiteVariables,
  {
    mode = 'development',
    extraEntrypoints = [],
  }: { mode?: string; extraEntrypoints?: string[] } = {},
): Promise<string[]> {
  const packageDir = getPackageDir();
  const distDir = getDistDir();
  const isDev = mode === 'development';

  const entrypoints = [
    path.resolve(packageDir, 'src/index.ts'),
    ...extraEntrypoints,
  ];

  const result = await Bun.build({
    entrypoints,
    outdir: distDir,
    naming: '[name].bundle.[ext]',
    minify: mode === 'production',
    sourcemap: isDev ? 'inline' : 'none',
    define: createDefine(siteVariables, isDev),
    external: ['*.woff2'],
    plugins: [createScssPlugin(siteVariables)],
  });

  if (!result.success) {
    const messages = result.logs
      .filter(log => log.level === 'error')
      .map(log => log.message || String(log));
    throw new Error(`Bundle failed:\n${messages.join('\n')}`);
  }

  // Return the output filenames for asset tag injection
  const assetFiles = result.outputs.map(output =>
    path.relative(distDir, output.path).split(path.sep).join(path.posix.sep),
  );

  return assetFiles;
}

export { renderThemeScss, createDefine };
