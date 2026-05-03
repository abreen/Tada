import util from 'util';

type StyleFormat = Parameters<typeof util.styleText>[0];
type TagFn = (str: TemplateStringsArray, ...args: unknown[]) => string;

const style =
  (styles: StyleFormat): TagFn =>
  (str, ...args) =>
    util.styleText(styles, String.raw(str, ...args));

export const R = style(['red']);
export const G = style(['green']);
export const B = style(['blue']);
export const Y = style(['yellow']);
export const L = style(['gray']);
export const P = style(['magenta']);
export const I = style(['italic', 'bold']);

export const Ri = style(['inverse', 'red']);
export const Gi = style(['inverse', 'green']);
export const Yi = style(['inverse', 'yellow']);
export const Li = style(['inverse', 'gray']);
