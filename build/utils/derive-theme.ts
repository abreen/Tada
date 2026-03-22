import { parse, oklch, rgb, toGamut, formatHex } from 'culori';
import type { Oklch, Rgb } from 'culori';
import type { DerivedTheme } from '../types';

// OKLCH lightness range for the theme color used as backgrounds/outlines
const LIGHT_THEME_L_MIN = 0.35;
const LIGHT_THEME_L_MAX = 0.62;
const DARK_THEME_L_MIN = 0.55;
const DARK_THEME_L_MAX = 0.8;

// OKLCH lightness range for theme-derived text on page backgrounds
const LIGHT_TEXT_L_MIN = 0.35;
const LIGHT_TEXT_L_MAX = 0.5;
const DARK_TEXT_L_MIN = 0.7;
const DARK_TEXT_L_MAX = 0.82;

function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), max);
}

function linearize(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function relativeLuminance({ r, g, b }: Rgb): number {
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

function contrastRatio(l1: number, l2: number): number {
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

// Pick black or white text for use on the given background color.
// Prefer white unless black has substantially better contrast (1.5x),
// which gives white text on saturated mid-tone colors like steelblue and tomato.
function pickTextColor(bgHex: string): '#fff' | '#000' {
  const bgRgb = rgb(parse(bgHex)) as Rgb;
  const bgLum = relativeLuminance(bgRgb);
  const whiteContrast = contrastRatio(1, bgLum);
  const blackContrast = contrastRatio(bgLum, 0);
  return blackContrast > whiteContrast * 1.9 ? '#000' : '#fff';
}

function toHex(oklchColor: Oklch): string {
  return formatHex(toGamut('rgb', 'oklch')(oklchColor));
}

export function deriveTheme(cssColor: string): DerivedTheme {
  const parsed = parse(cssColor);
  if (!parsed) {
    throw new Error(`Invalid color: ${cssColor}`);
  }

  const base = oklch(parsed) as Oklch;
  const l = base.l;
  const c = base.c || 0;
  const h = base.h;

  const lightL = clamp(l, LIGHT_THEME_L_MIN, LIGHT_THEME_L_MAX);
  const darkL = clamp(l, DARK_THEME_L_MIN, DARK_THEME_L_MAX);

  const textLightL = clamp(l, LIGHT_TEXT_L_MIN, LIGHT_TEXT_L_MAX);
  const textDarkL = clamp(l, DARK_TEXT_L_MIN, DARK_TEXT_L_MAX);

  const themeColorLight = toHex({ mode: 'oklch', l: lightL, c, h });
  const themeColorDark = toHex({ mode: 'oklch', l: darkL, c, h });

  return {
    themeColorLight,
    themeColorDark,
    themeColorTextLight: toHex({ mode: 'oklch', l: textLightL, c, h }),
    themeColorTextDark: toHex({ mode: 'oklch', l: textDarkL, c, h }),
    textOnThemeLight: pickTextColor(themeColorLight),
    textOnThemeDark: pickTextColor(themeColorDark),
  };
}

export function getTextOnColor(cssColor: string): '#fff' | '#000' {
  const parsed = parse(cssColor);
  if (!parsed) {
    throw new Error(`Invalid color: ${cssColor}`);
  }
  const gamutMapped = formatHex(toGamut('rgb', 'oklch')(parsed));
  return pickTextColor(gamutMapped);
}
