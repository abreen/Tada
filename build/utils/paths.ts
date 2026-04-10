import path from 'path';
import type { SiteVariables } from '../types';

export function getPackageDir(): string {
  return path.resolve(import.meta.dir, '..', '..');
}

export function getProjectDir(): string {
  return process.cwd();
}

export function getContentDir(): string {
  return path.resolve(getProjectDir(), 'content');
}

export function getDistDir(): string {
  return path.resolve(getProjectDir(), 'dist');
}

export function getProdDistDir(): string {
  return path.resolve(getProjectDir(), 'dist-prod');
}

export function getPublicDir(): string {
  return path.resolve(getProjectDir(), 'public');
}

export function getConfigDir(): string {
  return getProjectDir();
}

export function createApplyBasePath(
  siteVariables: SiteVariables,
): (subPath: string) => string {
  return function applyBasePath(subPath: string): string {
    if (!subPath.startsWith('/')) {
      throw new Error('invalid internal path, must start with "/": ' + subPath);
    }

    let path = siteVariables.basePath || '/';
    if (path.endsWith('/')) {
      path = path.slice(0, -1);
    }
    return path + subPath;
  };
}

export function toPosix(p: string): string {
  return p.split(path.sep).join(path.posix.sep);
}

export function normalizeOutputPath(outputPath: string): string {
  const normalized = path.posix.normalize(toPosix(outputPath));
  if (normalized === '.' || normalized === '') {
    return '/';
  }
  return normalized.startsWith('/') ? normalized : `/${normalized}`;
}
