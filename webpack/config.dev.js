const ContentWatchPlugin = require('./content-watch-plugin');
const { createBaseConfig } = require('./config.base');
const { compileTemplates } = require('./templates');
const { getDevSiteVariables } = require('./site-variables');

const siteVariables = getDevSiteVariables();

module.exports = async (env = {}) => {
  compileTemplates(siteVariables);

  const entry = { index: './src/index.ts' };
  if (env.watchMode) {
    entry.reload = './webpack/watch-reload-client.js';
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
