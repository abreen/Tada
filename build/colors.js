const util = require('util');

const R = (str, ...args) => util.styleText(['red'], String.raw(str, ...args));
const G = (str, ...args) => util.styleText(['green'], String.raw(str, ...args));
const B = (str, ...args) => util.styleText(['blue'], String.raw(str, ...args));
const Y = (str, ...args) =>
  util.styleText(['yellow'], String.raw(str, ...args));
const L = (str, ...args) =>
  util.styleText(['blackBright'], String.raw(str, ...args));
const P = (str, ...args) =>
  util.styleText(['magenta'], String.raw(str, ...args));
const I = (str, ...args) =>
  util.styleText(['italic', 'bold'], String.raw(str, ...args));

module.exports = { R, G, B, Y, L, P, I };
