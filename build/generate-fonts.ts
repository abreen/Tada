import fs from 'fs';
import path from 'path';
import { getPackageDir } from './utils/paths';
import { makeLogger } from './log';

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

export function getDefaultFontPreloadFiles(
  defaultFont: 'sans' | 'serif' | undefined,
): readonly string[] {
  return DEFAULT_FONT_PRELOAD_FILES[defaultFont ?? 'sans'];
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
