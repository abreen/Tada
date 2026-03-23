import fs from 'fs';
import path from 'path';
import * as sass from 'sass';
import { makeLogger } from './log';

const log = makeLogger(__filename);

export function copyKatexAssets(distDir: string): void {
  log.info`Copying KaTeX assets`;

  const outDir = path.join(distDir, 'katex');
  const outFontsDir = path.join(outDir, 'fonts');
  fs.mkdirSync(outFontsDir, { recursive: true });

  // Compile KaTeX SCSS with woff2-only font references
  const katexScssDir = path.dirname(
    require.resolve('katex/src/styles/katex.scss'),
  );
  const result = sass.compileString(
    `@use 'katex' with ($use-woff2: true, $use-woff: false, $use-ttf: false, $font-folder: 'fonts');`,
    { loadPaths: [katexScssDir], style: 'compressed' },
  );
  fs.writeFileSync(path.join(outDir, 'katex.min.css'), result.css);

  // Copy woff2 fonts
  const katexDistDir = path.dirname(
    require.resolve('katex/dist/katex.min.css'),
  );
  const fontsDir = path.join(katexDistDir, 'fonts');
  for (const file of fs.readdirSync(fontsDir)) {
    if (file.endsWith('.woff2')) {
      fs.copyFileSync(path.join(fontsDir, file), path.join(outFontsDir, file));
    }
  }
}
