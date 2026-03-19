const { getFlair } = require('./log');

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

      console.log(getFlair());
    });
  },
};
