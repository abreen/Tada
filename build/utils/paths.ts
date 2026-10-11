import path from 'path';
import { globals } from '../globals';
import type { SiteVariables } from '../types';

/** The search index directory inside the output directory */
export const SEARCH_INDEX_DIR = 'pagefind';

export function getPackageDir(): string {
  return path.resolve(import.meta.dir, '..', '..');
}

export function getProjectDir(): string {
  return globals.cwd();
}

/** A path relative to the project directory, for messages */
export function toDisplayPath(filePath: string): string {
  return toPosix(path.relative(getProjectDir(), filePath));
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

/** The site's own scripts and styles, compiled into `_scripts/` */
export function getSrcDir(): string {
  return path.resolve(getProjectDir(), 'src');
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

/** Whether `filePath` is inside `dir`, not counting `dir` itself */
export function isInside(dir: string, filePath: string): boolean {
  const relative = path.relative(dir, filePath);
  return (
    relative !== '' &&
    relative !== '..' &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
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
