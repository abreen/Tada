import { copyFileSync, mkdirSync } from 'fs';
import path from 'path';

const FACE_FILES = {
  regular: 'regular',
  italic: 'italic',
  bold: 'bold',
  boldItalic: 'bold-italic',
} as const;

export function installCustomFontFixtures(
  repoDir: string,
  siteDir: string,
): string {
  const outputDir = path.join(siteDir, 'public', 'custom-fonts');
  mkdirSync(outputDir, { recursive: true });
  const sourceSerifRegular = path.join(
    repoDir,
    'fonts/source-serif-4/woff2/SourceSerif4-VariableFont_opsz,wght.woff2',
  );
  const sourceSerifItalic = path.join(
    repoDir,
    'fonts/source-serif-4/woff2/SourceSerif4-Italic-VariableFont_opsz,wght.woff2',
  );
  const sourceMono = {
    regular: path.join(
      repoDir,
      'fonts/courier-prime/woff2/CourierPrime-Regular.woff2',
    ),
    italic: path.join(
      repoDir,
      'fonts/courier-prime/woff2/CourierPrime-Italic.woff2',
    ),
    bold: path.join(
      repoDir,
      'fonts/courier-prime/woff2/CourierPrime-Bold.woff2',
    ),
    boldItalic: path.join(
      repoDir,
      'fonts/courier-prime/woff2/CourierPrime-BoldItalic.woff2',
    ),
  };

  for (const [face, suffix] of Object.entries(FACE_FILES)) {
    copyFileSync(
      face === 'italic' || face === 'boldItalic'
        ? sourceSerifItalic
        : sourceSerifRegular,
      path.join(outputDir, `body-${suffix}.woff2`),
    );
    copyFileSync(
      sourceMono[face],
      path.join(outputDir, `mono-${suffix}.woff2`),
    );
  }

  return `fontOverrides:
  serif:
    regular: custom-fonts/body-regular.woff2
    italic: custom-fonts/body-italic.woff2
    bold: custom-fonts/body-bold.woff2
    boldItalic: custom-fonts/body-bold-italic.woff2
    tuning:
      fontSizeAdjust: 0.67
  serifMono:
    regular: custom-fonts/mono-regular.woff2
    italic: custom-fonts/mono-italic.woff2
    bold: custom-fonts/mono-bold.woff2
    boldItalic: custom-fonts/mono-bold-italic.woff2
    tuning:
      fontSizeAdjust: 0.5796
`;
}
