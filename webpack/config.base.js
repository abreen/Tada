const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const GenerateContentAssetsPlugin = require('./generate-content-assets-plugin');
const PagefindPlugin = require('./pagefind-plugin');
const GenerateFaviconPlugin = require('./generate-favicon-plugin');
const GenerateManifestPlugin = require('./generate-manifest-plugin');
const { getDistDir, createDefinePlugin } = require('./util');
const { isFeatureEnabled } = require('./features');
const {
  getContentDir,
  getPackageDir,
  getProjectDir,
  getPublicDir,
} = require('./utils/paths');

const distDir = getDistDir();

function createModuleRules() {
  const packageDir = getPackageDir();
  return [
    { test: /\.js$/, exclude: /node_modules/, use: { loader: 'babel-loader' } },
    {
      test: /\.tsx?$/,
      exclude: /node_modules/,
      loader: 'ts-loader',
      options: { configFile: path.resolve(packageDir, 'tsconfig.json') },
    },
    {
      test: /\.(sa|sc|c)ss$/,
      use: [
        MiniCssExtractPlugin.loader,
        'css-loader',
        {
          loader: 'sass-loader',
          options: { sassOptions: { loadPaths: [getProjectDir()] } },
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
        { from: getPublicDir(), to: '.', noErrorOnMissing: true },
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
      modules: [path.resolve(packageDir, 'node_modules'), 'node_modules'],
    },
    devtool,
    module: { rules: createModuleRules() },
    ...(optimization && { optimization }),
    plugins: await createPlugins(siteVariables, { defineIsDev, plugins }),
    stats: 'errors-only',
  };
}

module.exports = { createBaseConfig };
