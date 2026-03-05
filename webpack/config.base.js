const CopyPlugin = require('copy-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const GenerateContentAssetsPlugin = require('./generate-content-assets-plugin');
const PagefindPlugin = require('./pagefind-plugin');
const GenerateFaviconPlugin = require('./generate-favicon-plugin');
const GenerateManifestPlugin = require('./generate-manifest-plugin');
const { getDistDir, createDefinePlugin } = require('./util');
const { isFeatureEnabled } = require('./features');

const distDir = getDistDir();

function createModuleRules() {
  return [
    { test: /\.js$/, exclude: /node_modules/, use: { loader: 'babel-loader' } },
    { test: /\.tsx?$/, exclude: /node_modules/, loader: 'ts-loader' },
    {
      test: /\.(sa|sc|c)ss$/,
      use: [MiniCssExtractPlugin.loader, 'css-loader', 'sass-loader'],
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
        { from: 'public', to: '.' },
        {
          from: '**/*.{png,jpg,jpeg,gif,svg,txt,zip}',
          context: 'content',
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
  return {
    mode,
    entry,
    output: {
      path: distDir,
      publicPath: siteVariables.basePath,
      filename: '[name].bundle.js',
    },
    resolve: { extensions: ['.ts', '.js', '.json'] },
    devtool,
    module: { rules: createModuleRules() },
    ...(optimization && { optimization }),
    plugins: await createPlugins(siteVariables, { defineIsDev, plugins }),
    stats: 'errors-only',
  };
}

module.exports = { createBaseConfig };
