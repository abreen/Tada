const { DefinePlugin } = require('webpack');

function createDefinePlugin(siteVariables, isDev = false) {
  return new DefinePlugin({
    'window.siteVariables.base': JSON.stringify(siteVariables.base),
    'window.siteVariables.basePath': JSON.stringify(siteVariables.basePath),
    'window.siteVariables.titlePostfix': JSON.stringify(
      siteVariables.titlePostfix,
    ),
    'window.siteVariables.defaultTimeZone': JSON.stringify(
      siteVariables.defaultTimeZone,
    ),
    'window.siteVariables.timezones': JSON.stringify(
      require('../../src/timezone/timezones.json'),
    ),
    'window.IS_DEV': JSON.stringify(isDev),
  });
}

module.exports = { createDefinePlugin };
