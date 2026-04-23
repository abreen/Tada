import path from 'path';
import { globals, type Globals } from '../globals';
import type { SiteVariables } from '../types';

type PathGlobals = Pick<Globals, 'cwd'>;

export function getPackageDir(): string {
  return path.resolve(import.meta.dir, '..', '..');
}

export function getProjectDir(): string {
  const runtimeGlobals: PathGlobals = globals;
  return runtimeGlobals.cwd();
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

export function createApplyBasePath(
  siteVariables: SiteVariables,
): (subPath: string) => string {
  const base = (siteVariables.basePath || '/').replace(/\/$/, '');
  return function applyBasePath(subPath: string): string {
    if (!subPath.startsWith('/')) {
      throw new Error('invalid internal path, must start with "/": ' + subPath);
    }
    return base + subPath;
  };
}

export function toPosix(p: string): string {
  return p.split(path.sep).join(path.posix.sep);
}

/**
 * Convert an OS-native relative filesystem path to a URL path: convert
 * separators to '/', then percent-encode each segment so characters that
 * are unsafe in URLs (space, ?, #, non-ASCII, etc.) are encoded. Use this
 * anywhere a filesystem-derived path is emitted as an href or looked up
 * against a URL-encoded href.
 */
export function toUrlPath(p: string): string {
  return toPosix(p).split('/').map(encodeURIComponent).join('/');
}

export function normalizeOutputPath(outputPath: string): string {
  const normalized = path.posix.normalize(toPosix(outputPath));
  if (normalized === '.') {
    return '/';
  }
  return normalized.startsWith('/') ? normalized : `/${normalized}`;
}
