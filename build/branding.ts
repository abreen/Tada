import fs from 'fs';
import path from 'path';
import { isValidPublicAssetPath } from './custom-fonts';
import type { SiteVariables } from './types';

export function validateBranding(
  site: Pick<SiteVariables, 'logo' | 'favicon'>,
  options: {
    publicDir: string;
    publicFiles: ReadonlySet<string>;
    readFile?: (filePath: string) => Buffer;
  },
): string[] {
  const diagnostics: string[] = [];
  for (const field of ['logo', 'favicon'] as const) {
    const value = site[field];
    if (value === undefined) {
      continue;
    }
    if (
      !isValidPublicAssetPath(value) ||
      (field === 'favicon' && !value.endsWith('.ico'))
    ) {
      diagnostics.push(
        `${field} "${value}" must be a public-relative POSIX path${field === 'favicon' ? ' ending in .ico' : ''}`,
      );
      continue;
    }
    const absolutePath = path.resolve(options.publicDir, ...value.split('/'));
    if (!options.publicFiles.has(absolutePath)) {
      diagnostics.push(`${field} "${value}" does not exist in public/`);
      continue;
    }
    try {
      (options.readFile ?? fs.readFileSync)(absolutePath);
    } catch {
      diagnostics.push(`${field} "${value}" could not be read`);
    }
  }
  return diagnostics;
}
