import { parse, oklch, toGamut, formatHex, wcagContrast } from 'culori';
import type { Oklch } from 'culori';
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

// Pick black or white text for use on the given background color.
// Prefer white unless black has substantially better contrast (1.9x),
// which gives white text on saturated mid-tone colors like steelblue and tomato.
function pickTextColor(bgHex: string): '#fff' | '#000' {
  return wcagContrast(bgHex, '#000') > wcagContrast(bgHex, '#fff') * 1.9
    ? '#000'
    : '#fff';
}

function toHex(oklchColor: Oklch): string {
  return formatHex(toGamut('rgb', 'oklch')(oklchColor));
}

export function deriveTheme(cssColor: string): DerivedTheme {
  const parsed = parse(cssColor);
  if (!parsed) {
    throw new Error(`Invalid color: ${cssColor}`);
  }

  // Keep the hue and chroma of the theme color, clamping only its lightness
  const base = oklch(parsed);
  const withLightness = (min: number, max: number) =>
    toHex({ ...base, l: clamp(base.l, min, max) });

  const themeColorLight = withLightness(LIGHT_THEME_L_MIN, LIGHT_THEME_L_MAX);
  const themeColorDark = withLightness(DARK_THEME_L_MIN, DARK_THEME_L_MAX);

  return {
    themeColorLight,
    themeColorDark,
    themeColorTextLight: withLightness(LIGHT_TEXT_L_MIN, LIGHT_TEXT_L_MAX),
    themeColorTextDark: withLightness(DARK_TEXT_L_MIN, DARK_TEXT_L_MAX),
    textOnThemeLight: pickTextColor(themeColorLight),
    textOnThemeDark: pickTextColor(themeColorDark),
  };
}
