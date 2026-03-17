const { getFlair } = require('./log');
const { getDistDir } = require('./util');

module.exports = {
  apply: compiler => {
    compiler.hooks.afterEmit.tap('AfterEmitPlugin', compilation => {
      const isWatch =
        !!compiler.watching ||
        !!compiler.watchMode ||
        !!compilation?.compiler?.watchMode;
      if (isWatch) {
        return;
      }

      const distDir = getDistDir();

      console.log(getFlair());
      console.log(`The build output is available at ${distDir}`);
      console.log('Now use `tada serve` to start a local web server');
    });
  },
};
