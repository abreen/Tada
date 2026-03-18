const path = require('path');
const ContentWatchPlugin = require('./content-watch-plugin');
const { createBaseConfig } = require('./config.base');
const { getDevSiteVariables } = require('./site-variables');
const { getPackageDir } = require('./utils/paths');

const siteVariables = getDevSiteVariables();

module.exports = async (env = {}) => {
  const packageDir = getPackageDir();
  const entry = { index: path.resolve(packageDir, 'src/index.ts') };
  if (env.watchMode) {
    entry.reload = path.resolve(packageDir, 'webpack/watch-reload-client.js');
  }

  return createBaseConfig({
    mode: 'development',
    devtool: 'inline-source-map',
    siteVariables,
    entry,
    defineIsDev: true,
    plugins: [new ContentWatchPlugin(siteVariables)],
  });
};
