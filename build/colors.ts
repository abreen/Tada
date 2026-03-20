import util from 'util';

export const R = (str: TemplateStringsArray, ...args: unknown[]): string =>
  util.styleText(['red'], String.raw(str, ...args));
export const G = (str: TemplateStringsArray, ...args: unknown[]): string =>
  util.styleText(['green'], String.raw(str, ...args));
export const B = (str: TemplateStringsArray, ...args: unknown[]): string =>
  util.styleText(['blue'], String.raw(str, ...args));
export const Y = (str: TemplateStringsArray, ...args: unknown[]): string =>
  util.styleText(['yellow'], String.raw(str, ...args));
export const L = (str: TemplateStringsArray, ...args: unknown[]): string =>
  util.styleText(['blackBright'], String.raw(str, ...args));
export const P = (str: TemplateStringsArray, ...args: unknown[]): string =>
  util.styleText(['magenta'], String.raw(str, ...args));
export const I = (str: TemplateStringsArray, ...args: unknown[]): string =>
  util.styleText(['italic', 'bold'], String.raw(str, ...args));

export const Ri = (str: TemplateStringsArray, ...args: unknown[]): string =>
  util.styleText(['inverse', 'red'], String.raw(str, ...args));
export const Gi = (str: TemplateStringsArray, ...args: unknown[]): string =>
  util.styleText(['inverse', 'green'], String.raw(str, ...args));
export const Yi = (str: TemplateStringsArray, ...args: unknown[]): string =>
  util.styleText(['inverse', 'yellow'], String.raw(str, ...args));
export const Li = (str: TemplateStringsArray, ...args: unknown[]): string =>
  util.styleText(['inverse', 'blackBright'], String.raw(str, ...args));
