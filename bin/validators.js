function validateSymbol(value) {
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

function validateHslColor(value) {
  if (!value) {
    return 'Color is required';
  }
  if (!/^hsl\(\d+(deg)? \d+% \d+%\)$/.test(value)) {
    return 'Color must be in HSL format, e.g. hsl(195 70% 40%)';
  }
  return null;
}

function validateUrl(value) {
  if (!value) {
    return 'URL is required';
  }
  if (!/^https?:\/\/[-.:a-zA-Z0-9]+$/.test(value)) {
    return 'Must be a valid URL like https://example.edu (no trailing slash or path)';
  }
  return null;
}

function validateBasePath(value) {
  if (!/^\/[-a-zA-Z0-9]*$/.test(value)) {
    return 'Must start with / and contain only letters, digits, and hyphens';
  }
  return null;
}

function createSiteConfig({
  title,
  symbol,
  themeColor,
  tintHue,
  tintAmount,
  defaultTimeZone,
  base,
  basePath,
  internalDomains,
}) {
  return {
    title,
    symbol,
    features: { search: true, code: true, favicon: true },
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

module.exports = {
  validateSymbol,
  validateHslColor,
  validateUrl,
  validateBasePath,
  createSiteConfig,
};
