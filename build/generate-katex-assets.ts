import fs from 'fs';
import path from 'path';
import * as sass from 'sass';
import type { OutputContent } from './types';

let katexCss: string | undefined;

function compileKatexCss(): string {
  // Compile KaTeX SCSS with woff2-only font references
  const katexScssDir = path.dirname(
    require.resolve('katex/src/styles/katex.scss'),
  );
  return sass.compileString(
    `@use 'katex' with ($use-woff2: true, $use-woff: false, $use-ttf: false, $font-folder: 'fonts');`,
    { loadPaths: [katexScssDir], style: 'compressed' },
  ).css;
}

/** The KaTeX stylesheet and its woff2 fonts, keyed by output path */
export function getKatexOutputs(): Map<string, OutputContent> {
  katexCss ??= compileKatexCss();
  const outputs = new Map<string, OutputContent>([
    ['katex/katex.min.css', katexCss],
  ]);
  const fontsDir = path.join(
    path.dirname(require.resolve('katex/dist/katex.min.css')),
    'fonts',
  );
  for (const file of fs.readdirSync(fontsDir)) {
    if (file.endsWith('.woff2')) {
      outputs.set(`katex/fonts/${file}`, {
        copyFrom: path.join(fontsDir, file),
      });
    }
  }
  return outputs;
}
