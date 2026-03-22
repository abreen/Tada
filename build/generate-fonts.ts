import fs from 'fs';
import path from 'path';
import { getPackageDir } from './utils/paths';
import { makeLogger } from './log';

const log = makeLogger(__filename);
const FONTS_DIR = path.join(getPackageDir(), 'fonts');

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
