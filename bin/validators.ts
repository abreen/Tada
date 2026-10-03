import timezones from '../src/timezone/timezones.json' with { type: 'json' };
import type { SiteConfigInput, SiteVariables } from '../build/types';

const SUPPORTED_TIME_ZONES: readonly string[] = timezones.map(tz => tz.value);
const FALLBACK_TIME_ZONE = 'UTC';

export function validateSymbol(value: string): string | null {
  if (!value) {
    return 'Symbol is required';
  }
  if (value.length > 5) {
    return 'Symbol must be 5 characters or fewer';
  }
  if (!/^[A-Z0-9\- ]{1,5}$/.test(value)) {
    return 'Symbol must contain only uppercase letters, digits, hyphens, and spaces';
  }
  return null;
}

export function validateColor(value: string): string | null {
  if (!value) {
    return 'Color is required';
  }
  try {
    if (!Bun.color(value)) {
      throw new Error();
    }
  } catch {
    return 'Must be a valid CSS color, e.g. "tomato", "#c04040", or "hsl(195 70% 40%)"';
  }
  return null;
}

export function validateHue(value: string): string | null {
  if (!value) {
    return 'Hue is required';
  }
  const n = Number(String(value).replace(/deg$/, ''));
  if (!Number.isInteger(n) || n < 0 || n > 360) {
    return 'Must be an integer from 0 to 360, with or without "deg"';
  }
  return null;
}

export function validateUrl(value: string): string | null {
  if (!value) {
    return 'URL is required';
  }
  if (!/^https?:\/\/[-.:a-zA-Z0-9]+$/.test(value)) {
    return 'Must be a valid URL like https://example.edu (no trailing slash or path)';
  }
  return null;
}

export function validateBasePath(value: string): string | null {
  if (!/^\/(?:[-a-zA-Z0-9]+(?:\/[-a-zA-Z0-9]+)*)?$/.test(value)) {
    return 'Must start with / and contain path segments made of letters, digits, and hyphens';
  }
  return null;
}

export function validateTimeZone(value: string): string | null {
  if (!value) {
    return 'Time zone is required';
  }
  if (!SUPPORTED_TIME_ZONES.includes(value)) {
    return `Must be one of the supported time zones: ${SUPPORTED_TIME_ZONES.join(', ')}`;
  }
  return null;
}

/**
 * Picks the default time zone for `tada init`: the system zone when builds
 * support it, otherwise UTC with a note explaining the fallback.
 */
export function resolveDefaultTimeZone(systemTimeZone: string | undefined): {
  timeZone: string;
  note: string | null;
} {
  if (systemTimeZone && validateTimeZone(systemTimeZone) === null) {
    return { timeZone: systemTimeZone, note: null };
  }
  return {
    timeZone: FALLBACK_TIME_ZONE,
    note: systemTimeZone
      ? `System time zone ${systemTimeZone} is not supported; using ${FALLBACK_TIME_ZONE}`
      : `System time zone is unknown; using ${FALLBACK_TIME_ZONE}`,
  };
}

export function createSiteConfig({
  title,
  symbol,
  themeColor,
  tintHue,
  tintAmount,
  defaultTimeZone,
  base,
  basePath,
  internalDomains,
  features,
  extensionToShikiLanguage,
  shikiLanguages,
}: SiteConfigInput): SiteVariables {
  return {
    title,
    titlePostfix: ` - ${title}`,
    symbol,
    features,
    base,
    basePath,
    internalDomains,
    defaultTimeZone,
    defaultFont: 'sans',
    defaultContrast: 'standard',
    extensionToShikiLanguage,
    shikiLanguages,
    themeColor,
    tintHue: Number(String(tintHue).replace(/deg$/, '')),
    tintAmount: Number(tintAmount),
    vars: { foobar: 123 },
  };
}
