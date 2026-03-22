import type { SiteConfigInput, SiteVariables } from '../build/types';

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
  if (!/^\/[-a-zA-Z0-9]*$/.test(value)) {
    return 'Must start with / and contain only letters, digits, and hyphens';
  }
  return null;
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
}: SiteConfigInput): SiteVariables {
  return {
    title,
    symbol,
    features,
    base,
    basePath,
    internalDomains,
    defaultTimeZone,
    codeLanguages: { java: 'java', py: 'python' },
    themeColor,
    tintHue: Number(tintHue),
    tintAmount: Number(tintAmount),
    vars: {},
  };
}
