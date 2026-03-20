const fs = require('fs');
const os = require('os');
const path = require('path');
const _ = require('lodash');
const sass = require('sass');
const { getPackageDir, getProjectDir, getDistDir } = require('./utils/paths');
const { deriveTheme } = require('./utils/derive-theme');

function renderThemeScss(siteVariables) {
  const templatePath = path.join(getPackageDir(), 'templates/_theme.scss');
  const template = fs.readFileSync(templatePath, 'utf-8');
  const theme = deriveTheme(siteVariables.themeColor);
  const tintHue = siteVariables.tintHue ?? 20;
  const tintAmount = siteVariables.tintAmount ?? 100;
  const rendered = _.template(template)({ ...theme, tintHue, tintAmount });

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tada-'));
  const configDir = path.join(tmpDir, 'config');
  fs.mkdirSync(configDir);
  fs.writeFileSync(path.join(configDir, '_theme.scss'), rendered);

  return tmpDir;
}

function createDefine(siteVariables, isDev = false) {
  return {
    'window.siteVariables.base': JSON.stringify(siteVariables.base),
    'window.siteVariables.basePath': JSON.stringify(siteVariables.basePath),
    'window.siteVariables.titlePostfix': JSON.stringify(
      siteVariables.titlePostfix,
    ),
    'window.siteVariables.defaultTimeZone': JSON.stringify(
      siteVariables.defaultTimeZone,
    ),
    'window.siteVariables.timezones': JSON.stringify(
      require('../src/timezone/timezones.json'),
    ),
    'window.IS_DEV': JSON.stringify(isDev),
  };
}

function createScssPlugin(siteVariables) {
  const themeDir = renderThemeScss(siteVariables);

  return {
    name: 'scss',
    setup(build) {
      build.onLoad({ filter: /\.scss$/ }, args => {
        const result = sass.compile(args.path, {
          loadPaths: [themeDir, getProjectDir()],
        });
        return { contents: result.css, loader: 'css' };
      });
    },
  };
}

async function bundle(
  siteVariables,
  { mode = 'development', extraEntrypoints = [] } = {},
) {
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

module.exports = { bundle, renderThemeScss, createDefine };
