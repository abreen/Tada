const TerserPlugin = require('terser-webpack-plugin');
const { createBaseConfig } = require('./config.base');
const { compileTemplates } = require('./templates');
const { getProdSiteVariables } = require('./site-variables');

const siteVariables = getProdSiteVariables();

module.exports = async () => {
  compileTemplates(siteVariables);

  return createBaseConfig({
    mode: 'production',
    siteVariables,
    entry: { index: './src/index.ts' },
    devtool: false,
    optimization: {
      minimizer: [
        /*
         * Bun's event loop doesn't track TerserPlugin's worker threads,
         * causing a premature exit; set parallel to false to prevent worker
         * threads from being used.
         */
        new TerserPlugin({
          parallel: false,
          terserOptions: { output: { comments: false } },
        }),
      ],
    },
  });
};
