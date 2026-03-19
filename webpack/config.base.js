const fs = require('fs');
const os = require('os');
const path = require('path');
const _ = require('lodash');
const CopyPlugin = require('copy-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const GenerateContentAssetsPlugin = require('./generate-content-assets-plugin');
const PagefindPlugin = require('./pagefind-plugin');
const GenerateFaviconPlugin = require('./generate-favicon-plugin');
const GenerateManifestPlugin = require('./generate-manifest-plugin');
const GenerateFontsPlugin = require('./generate-fonts-plugin');
const { getDistDir, createDefinePlugin } = require('./util');
const { isFeatureEnabled } = require('./features');
const { B } = require('./colors');
const { makeLogger } = require('./log');
const {
  getContentDir,
  getPackageDir,
  getProjectDir,
  getPublicDir,
} = require('./utils/paths');
const { parseHsl } = require('./utils/parse-hsl');

const log = makeLogger('public');
const distDir = getDistDir();

function renderThemeScss(siteVariables) {
  const templatePath = path.join(getPackageDir(), 'templates/_theme.scss');
  const template = fs.readFileSync(templatePath, 'utf-8');
  const { hue, saturation, lightness } = parseHsl(siteVariables.themeColor);
  const tintHue = siteVariables.tintHue ?? 20;
  const tintAmount = siteVariables.tintAmount ?? 100;
  const rendered = _.template(template)({
    themeHue: hue,
    themeSaturation: saturation,
    themeLightness: lightness,
    tintHue,
    tintAmount,
  });

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tada-'));
  const configDir = path.join(tmpDir, 'config');
  fs.mkdirSync(configDir);
  fs.writeFileSync(path.join(configDir, '_theme.scss'), rendered);

  return tmpDir;
}

function createModuleRules(siteVariables) {
  const packageDir = getPackageDir();
  const themeDir = renderThemeScss(siteVariables);

  return [
    { test: /\.js$/, exclude: /node_modules/, use: { loader: 'babel-loader' } },
    {
      test: /\.tsx?$/,
      include: path.resolve(packageDir, 'src'),
      loader: 'ts-loader',
      options: { configFile: path.resolve(packageDir, 'tsconfig.json') },
    },
    {
      test: /\.(sa|sc|c)ss$/,
      use: [
        MiniCssExtractPlugin.loader,
        {
          loader: 'css-loader',
          options: {
            url: {
              // Don't bundle fonts (they are handled by GenerateFontsPlugin)
              filter: url => !url.endsWith('.woff2'),
            },
          },
        },
        {
          loader: 'sass-loader',
          options: { sassOptions: { loadPaths: [themeDir, getProjectDir()] } },
        },
      ],
    },
  ];
}

async function createPlugins(
  siteVariables,
  { defineIsDev = false, plugins = [] } = {},
) {
  return [
    new GenerateContentAssetsPlugin(siteVariables),
    createDefinePlugin(siteVariables, defineIsDev),
    new MiniCssExtractPlugin({
      filename: '[name].css',
      chunkFilename: '[id].css',
    }),
    new CopyPlugin({
      patterns: [
        {
          from: getPublicDir(),
          to: '.',
          noErrorOnMissing: true,
          filter: filePath => {
            const rel = path.relative(getPublicDir(), filePath);
            const posixRel = rel.split(path.sep).join(path.posix.sep);
            log.info`Copying public file ${B`${posixRel}`}`;
            return true;
          },
        },
        {
          from: '**/*.{png,jpg,jpeg,gif,svg,txt,zip}',
          context: getContentDir(),
          to: '[path][name][ext]',
          noErrorOnMissing: true,
        },
      ],
    }),
    isFeatureEnabled(siteVariables, 'search')
      ? new PagefindPlugin(siteVariables)
      : null,
    isFeatureEnabled(siteVariables, 'favicon')
      ? new GenerateFaviconPlugin(siteVariables)
      : null,
    isFeatureEnabled(siteVariables, 'favicon')
      ? new GenerateManifestPlugin(siteVariables)
      : null,
    new GenerateFontsPlugin(),
    ...plugins,
    require('./print-flair-plugin'),
  ].filter(Boolean);
}

async function createBaseConfig({
  mode,
  siteVariables,
  entry,
  devtool,
  defineIsDev = false,
  optimization,
  plugins,
}) {
  const packageDir = getPackageDir();
  return {
    mode,
    entry,
    output: {
      path: distDir,
      publicPath: siteVariables.basePath,
      filename: '[name].bundle.js',
    },
    resolve: { extensions: ['.ts', '.js', '.json'] },
    resolveLoader: {
      modules: [
        path.resolve(packageDir, 'node_modules'),
        path.resolve(packageDir, '..', '..'),
        'node_modules',
      ],
    },
    devtool,
    module: { rules: createModuleRules(siteVariables) },
    optimization: { emitOnErrors: false, ...(optimization || {}) },
    plugins: await createPlugins(siteVariables, { defineIsDev, plugins }),
    stats: 'errors-only',
  };
}

module.exports = { createBaseConfig };
