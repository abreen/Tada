import fs from 'fs';
import path from 'path';
import { getPackageDir } from './utils/paths';
import type { CopiedFile, SiteVariables } from './types';

const FONTS_DIR = path.join(getPackageDir(), 'fonts');

export const DEFAULT_FONT_PRELOAD_FILES = {
  sans: [
    'inter/InterVariable.woff2',
    'google-sans-code/GoogleSansCodeVariable.woff2',
  ],
  serif: [
    'source-serif-4/SourceSerif4-VariableFont_opsz,wght.woff2',
    'courier-prime/CourierPrime-Regular.woff2',
  ],
} as const;

interface DefaultFontPreloadFile {
  filePath: string;
  /**
   * `bundled` for Tada's own fonts, published at their paths in `fonts/`;
   * `site` for a configured font path, in `public/` or an `npm:` package
   */
  source: 'bundled' | 'site';
}

export function getDefaultFontPreloadFiles(
  siteVariables: Pick<SiteVariables, 'defaultFont' | 'fontOverrides'>,
): readonly DefaultFontPreloadFile[] {
  if ((siteVariables.defaultFont ?? 'sans') === 'sans') {
    return DEFAULT_FONT_PRELOAD_FILES.sans.map(filePath => ({
      filePath,
      source: 'bundled',
    }));
  }

  return [
    siteVariables.fontOverrides?.serif?.regular
      ? { filePath: siteVariables.fontOverrides.serif.regular, source: 'site' }
      : { filePath: DEFAULT_FONT_PRELOAD_FILES.serif[0], source: 'bundled' },
    siteVariables.fontOverrides?.serifMono?.regular
      ? {
          filePath: siteVariables.fontOverrides.serifMono.regular,
          source: 'site',
        }
      : { filePath: DEFAULT_FONT_PRELOAD_FILES.serif[1], source: 'bundled' },
  ];
}

/** Bundled browser fonts, as copy references keyed by output path */
export function getFontOutputs(): Map<string, CopiedFile> {
  const outputs = new Map<string, CopiedFile>();
  for (const family of fs.readdirSync(FONTS_DIR)) {
    const woff2Dir = path.join(FONTS_DIR, family, 'woff2');
    if (!fs.existsSync(woff2Dir) || !fs.statSync(woff2Dir).isDirectory()) {
      continue;
    }
    for (const file of fs.readdirSync(woff2Dir)) {
      if (file.endsWith('.woff2')) {
        outputs.set(`${family}/${file}`, {
          copyFrom: path.join(woff2Dir, file),
        });
      }
    }
  }
  return outputs;
}
