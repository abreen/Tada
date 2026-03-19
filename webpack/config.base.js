const fs = require('fs');
const os = require('os');
const path = require('path');
const _ = require('lodash');
const { RawSource } = require('webpack').sources;
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

function collectPublicFiles(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true, recursive: true });
  } catch {
    return [];
  }
  return entries
    .filter(entry => entry.isFile())
    .map(entry => {
      const rel = path.relative(dir, path.join(entry.parentPath, entry.name));
      return rel.split(path.sep).join(path.posix.sep);
    });
}

class CopyPublicFilesPlugin {
  apply(compiler) {
    const publicDir = getPublicDir();
    let lastCopiedFiles = new Set();

    compiler.hooks.make.tap('CopyPublicFilesPlugin', compilation => {
      // Watch all public files and directories
      function addDirs(dir) {
        compilation.contextDependencies.add(dir);
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          if (entry.isDirectory()) {
            addDirs(path.join(dir, entry.name));
          }
        }
      }
      try {
        addDirs(publicDir);
      } catch {
        // public/ doesn't exist, nothing to watch
      }

      for (const rel of collectPublicFiles(publicDir)) {
        compilation.fileDependencies.add(path.join(publicDir, rel));
      }
    });

    compiler.hooks.thisCompilation.tap('CopyPublicFilesPlugin', compilation => {
      compilation.hooks.processAssets.tap(
        {
          name: 'CopyPublicFilesPlugin',
          stage: compiler.webpack.Compilation.PROCESS_ASSETS_STAGE_ADDITIONAL,
        },
        () => {
          const allFiles = collectPublicFiles(publicDir);
          const isWatch = !!compiler.watching;
          const modifiedFiles = compiler.modifiedFiles || new Set();
          const filesToCopy =
            isWatch && modifiedFiles.size > 0
              ? allFiles.filter(rel => {
                  const abs = path.resolve(publicDir, rel);
                  return modifiedFiles.has(abs) || !lastCopiedFiles.has(rel);
                })
              : allFiles;

          for (const rel of filesToCopy) {
            const abs = path.join(publicDir, rel);
            const content = fs.readFileSync(abs);
            const source = new RawSource(content);
            log.info`Copying public file ${B`${rel}`}`;
            if (compilation.getAsset(rel)) {
              compilation.updateAsset(rel, source);
            } else {
              compilation.emitAsset(rel, source);
            }
          }

          lastCopiedFiles = new Set(allFiles);
        },
      );
    });
  }
}

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
    new CopyPublicFilesPlugin(),
    new CopyPlugin({
      patterns: [
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
