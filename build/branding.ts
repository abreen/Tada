import fs from 'fs';
import path from 'path';
import {
  isValidConfigAssetPath,
  resolveConfigAssetPath,
  type PackageFileSystem,
} from './packages';
import type { SiteVariables } from './types';

export function validateBranding(
  site: Pick<SiteVariables, 'logo' | 'favicon'>,
  options: {
    publicDir: string;
    publicFiles: ReadonlySet<string>;
    /** Where packages are found; defaults to the parent of `publicDir` */
    projectDir?: string;
    packageFs?: PackageFileSystem;
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
      !isValidConfigAssetPath(value) ||
      (field === 'favicon' && !value.endsWith('.ico'))
    ) {
      diagnostics.push(
        `${field} "${value}" must be a public-relative POSIX path or an npm: path${field === 'favicon' ? ', ending in .ico' : ''}`,
      );
      continue;
    }
    const resolved = resolveConfigAssetPath(value, {
      ...options,
      projectDir: options.projectDir ?? path.dirname(options.publicDir),
    });
    if ('reason' in resolved) {
      diagnostics.push(`${field} "${value}" ${resolved.reason}`);
      continue;
    }
    try {
      (options.readFile ?? fs.readFileSync)(resolved.filePath);
    } catch {
      diagnostics.push(`${field} "${value}" could not be read`);
    }
  }
  return diagnostics;
}
