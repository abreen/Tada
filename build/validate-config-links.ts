import path from 'path';
import type { BreadcrumbEntry } from './types';
import { encodeAuthoredUrl } from './template-globals';
import { normalizeOutputPath } from './utils/paths';

interface NavLink {
  text: string;
  internal?: string;
  external?: string;
  disabled?: boolean;
}

interface NavSection {
  title: string;
  links: NavLink[];
}

function requireRootRelativePath(
  value: string,
  errorPrefix: string,
): string | null {
  if (value.startsWith('/')) {
    return null;
  }

  return `${errorPrefix} must start with "/": "${value}"`;
}

const SPECIAL_URL_SCHEMES = new Set([
  'file',
  'ftp',
  'http',
  'https',
  'ws',
  'wss',
]);

function isValidAbsoluteAuthorUrl(value: string): boolean {
  if (value.trim() !== value) {
    return false;
  }

  const schemeMatch = value.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):/);
  if (!schemeMatch) {
    return false;
  }

  const scheme = schemeMatch[1].toLowerCase();
  if (
    SPECIAL_URL_SCHEMES.has(scheme) &&
    !value.startsWith(`${schemeMatch[1]}://`)
  ) {
    return false;
  }

  try {
    new URL(encodeAuthoredUrl(value));
    return true;
  } catch {
    return false;
  }
}

function getInternalHrefTarget(href: string): string {
  const { pathname } = splitHref(href);
  const normalized = normalizeOutputPath(pathname);
  try {
    return normalizeOutputPath(decodeURIComponent(normalized));
  } catch {
    return normalized;
  }
}

function validateDirectoryLink(
  href: string,
  resolvedTarget: string,
  validTargets: ReadonlySet<string>,
  context: string,
): string | null {
  const indexPath = normalizeOutputPath(
    path.posix.join(resolvedTarget, 'index.html'),
  );
  if (validTargets.has(indexPath)) {
    return `${context}: directory link must reference index.html explicitly: "${href}" (resolved to "${resolvedTarget}", expected "${indexPath}")`;
  }
  return null;
}

export function validateNavLinks(
  navData: unknown,
  validTargets: ReadonlySet<string>,
  fileName: string = 'nav.yaml',
): string[] {
  if (!Array.isArray(navData)) {
    return [];
  }

  const errors: string[] = [];

  for (const section of navData as NavSection[]) {
    for (const link of section.links) {
      if (link.disabled || !link.internal) {
        continue;
      }

      const rootRelativeError = requireRootRelativePath(
        link.internal,
        `${fileName}: internal link in section "${section.title}"`,
      );
      if (rootRelativeError) {
        errors.push(rootRelativeError);
        continue;
      }

      const normalized = getInternalHrefTarget(link.internal);
      const directoryError = validateDirectoryLink(
        link.internal,
        normalized,
        validTargets,
        `${fileName}: internal link in section "${section.title}"`,
      );
      if (directoryError) {
        errors.push(directoryError);
      } else if (!validTargets.has(normalized)) {
        errors.push(
          `${fileName}: broken internal link in section "${section.title}": "${link.internal}"`,
        );
      }
    }
  }

  return errors;
}

interface AuthorEntry {
  name: string;
  avatar: string;
  url?: string;
}

export function validateAuthorLinks(
  authorsData: unknown,
  validTargets: ReadonlySet<string>,
  fileName: string = 'authors.yaml',
): string[] {
  if (!authorsData || typeof authorsData !== 'object') {
    return [];
  }

  const errors: string[] = [];
  const authors = authorsData as Record<string, AuthorEntry>;

  for (const [key, author] of Object.entries(authors)) {
    const avatarRootRelativeError = requireRootRelativePath(
      author.avatar,
      `${fileName}: avatar path for "${key}"`,
    );
    if (avatarRootRelativeError) {
      errors.push(avatarRootRelativeError);
    } else {
      const avatarPath = getInternalHrefTarget(author.avatar);
      if (!validTargets.has(avatarPath)) {
        errors.push(
          `${fileName}: broken avatar path for "${key}": "${author.avatar}"`,
        );
      }
    }

    if (author.url) {
      if (isValidAbsoluteAuthorUrl(author.url)) {
        continue;
      }

      const urlRootRelativeError = requireRootRelativePath(
        author.url,
        `${fileName}: url for "${key}"`,
      );
      if (urlRootRelativeError) {
        errors.push(urlRootRelativeError);
      } else {
        const urlPath = getInternalHrefTarget(author.url);
        if (!validTargets.has(urlPath)) {
          errors.push(`${fileName}: broken url for "${key}": "${author.url}"`);
        }
      }
    }
  }

  return errors;
}

export function validateConfigLinks(
  validTargets: ReadonlySet<string>,
  navData: unknown,
  authorsData: unknown,
  {
    navFileName = 'nav.yaml',
    authorsFileName = 'authors.yaml',
  }: { navFileName?: string; authorsFileName?: string } = {},
): string[] {
  return [
    ...validateNavLinks(navData, validTargets, navFileName),
    ...validateAuthorLinks(authorsData, validTargets, authorsFileName),
  ];
}

function splitHref(href: string): { pathname: string; suffix: string } {
  const match = href.match(/^([^?#]*)(.*)$/);
  return { pathname: match ? match[1] : href, suffix: match ? match[2] : '' };
}

export function validateBreadcrumbs(
  breadcrumbs: unknown,
  filePath: string,
  validTargets: ReadonlySet<string>,
  sourceUrlPath: string,
): asserts breadcrumbs is BreadcrumbEntry[] | undefined {
  if (breadcrumbs === undefined) {
    return;
  }
  if (!Array.isArray(breadcrumbs)) {
    throw new Error(`${filePath}: breadcrumbs must be a list`);
  }
  breadcrumbs.forEach((entry: unknown, index) => {
    const context = `${filePath}: breadcrumb entry ${index + 1}`;
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new Error(`${context} must be an object with label and url fields`);
    }
    const { label, url } = entry as Record<string, unknown>;
    for (const [field, value] of Object.entries({ label, url })) {
      if (typeof value !== 'string' || !value.trim()) {
        throw new Error(`${context}: ${field} must be a nonempty string`);
      }
    }
    const error = validateBreadcrumbLink(
      url as string,
      filePath,
      validTargets,
      sourceUrlPath,
      index + 1,
    );
    if (error) {
      throw new Error(error);
    }
  });
}

export function validateBreadcrumbLink(
  url: string,
  filePath: string,
  validTargets: ReadonlySet<string>,
  sourceUrlPath: string,
  entryNumber = 1,
): string | null {
  const context = `${filePath}: breadcrumb entry ${entryNumber}`;
  const resolvedTarget = resolveBreadcrumbLinkTarget(url, sourceUrlPath);
  if (!resolvedTarget) {
    return `${context}: broken breadcrumb link: "${url}" (must be an internal site link with a pathname)`;
  }

  const directoryError = validateDirectoryLink(
    url,
    resolvedTarget,
    validTargets,
    context,
  );
  if (directoryError) {
    return directoryError;
  }

  if (!validTargets.has(resolvedTarget)) {
    return `${context}: broken breadcrumb link: "${url}"`;
  }

  return null;
}

export function resolveBreadcrumbLinkTarget(
  url: string,
  sourceUrlPath: string,
): string | null {
  // Breadcrumbs always point into this site. Backslashes also have special
  // URL semantics in browsers, so they cannot be used as path separators.
  if (
    /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(url) ||
    url.startsWith('//') ||
    url.includes('\\')
  ) {
    return null;
  }
  const { pathname } = splitHref(url);
  if (!pathname) {
    return null;
  }
  const sourceDir = path.posix.dirname(sourceUrlPath);
  const resolved = pathname.startsWith('/')
    ? normalizeOutputPath(pathname)
    : normalizeOutputPath(path.posix.join(sourceDir, pathname));

  try {
    return normalizeOutputPath(decodeURIComponent(resolved));
  } catch {
    return resolved;
  }
}
