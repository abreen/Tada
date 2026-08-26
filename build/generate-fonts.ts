import fs from 'fs';
import path from 'path';
import { getPackageDir } from './utils/paths';
import { makeLogger } from './log';
import type { SiteVariables } from './types';

const log = makeLogger(import.meta.url);
const FONTS_DIR = path.join(getPackageDir(), 'fonts');

export const DEFAULT_FONT_PRELOAD_FILES = {
  sans: [
    'inter/InterVariable.woff2',
    'google-sans-code/GoogleSansCodeVariable.woff2',
  ],
  serif: [
    'source-serif-4/SourceSerif4-VariableFont_opsz,wght.woff2',
    'libertinus-mono/LibertinusMono-Regular.woff2',
  ],
} as const;

interface DefaultFontPreloadFile {
  filePath: string;
  source: 'package' | 'public';
}

export function getDefaultFontPreloadFiles(
  siteVariables: Pick<SiteVariables, 'defaultFont' | 'fontOverrides'>,
): readonly DefaultFontPreloadFile[] {
  if ((siteVariables.defaultFont ?? 'sans') === 'sans') {
    return DEFAULT_FONT_PRELOAD_FILES.sans.map(filePath => ({
      filePath,
      source: 'package',
    }));
  }

  return [
    siteVariables.fontOverrides?.serif?.regular
      ? {
          filePath: siteVariables.fontOverrides.serif.regular,
          source: 'public',
        }
      : { filePath: DEFAULT_FONT_PRELOAD_FILES.serif[0], source: 'package' },
    siteVariables.fontOverrides?.serifMono?.regular
      ? {
          filePath: siteVariables.fontOverrides.serifMono.regular,
          source: 'public',
        }
      : { filePath: DEFAULT_FONT_PRELOAD_FILES.serif[1], source: 'package' },
  ];
}

export function copyFonts(distDir: string): void {
  log.info`Copying fonts`;

  for (const family of fs.readdirSync(FONTS_DIR)) {
    const woff2Dir = path.join(FONTS_DIR, family, 'woff2');
    if (!fs.existsSync(woff2Dir) || !fs.statSync(woff2Dir).isDirectory()) {
      continue;
    }

    const outFamilyDir = path.join(distDir, family);
    fs.mkdirSync(outFamilyDir, { recursive: true });

    for (const file of fs.readdirSync(woff2Dir)) {
      if (file.endsWith('.woff2')) {
        fs.copyFileSync(
          path.join(woff2Dir, file),
          path.join(outFamilyDir, file),
        );
        log.debug`Copied ${family}/${file}`;
      }
    }
  }
}
