import path from 'path';
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

export function validateNavLinks(
  navData: unknown,
  validTargets: Set<string>,
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
        `nav.json: internal link in section "${section.title}"`,
      );
      if (rootRelativeError) {
        errors.push(rootRelativeError);
        continue;
      }

      const normalized = normalizeOutputPath(link.internal);
      if (!validTargets.has(normalized)) {
        errors.push(
          `nav.json: broken internal link in section "${section.title}": "${link.internal}"`,
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
  validTargets: Set<string>,
): string[] {
  if (!authorsData || typeof authorsData !== 'object') {
    return [];
  }

  const errors: string[] = [];
  const authors = authorsData as Record<string, AuthorEntry>;

  for (const [key, author] of Object.entries(authors)) {
    const avatarRootRelativeError = requireRootRelativePath(
      author.avatar,
      `authors.json: avatar path for "${key}"`,
    );
    if (avatarRootRelativeError) {
      errors.push(avatarRootRelativeError);
    } else {
      const avatarPath = normalizeOutputPath(author.avatar);
      if (!validTargets.has(avatarPath)) {
        errors.push(
          `authors.json: broken avatar path for "${key}": "${author.avatar}"`,
        );
      }
    }

    if (author.url) {
      const urlRootRelativeError = requireRootRelativePath(
        author.url,
        `authors.json: url for "${key}"`,
      );
      if (urlRootRelativeError) {
        errors.push(urlRootRelativeError);
      } else {
        const urlPath = normalizeOutputPath(author.url);
        if (!validTargets.has(urlPath)) {
          errors.push(`authors.json: broken url for "${key}": "${author.url}"`);
        }
      }
    }
  }

  return errors;
}

export function validateConfigLinks(
  validTargets: Set<string>,
  navData: unknown,
  authorsData: unknown,
): string[] {
  return [
    ...validateNavLinks(navData, validTargets),
    ...validateAuthorLinks(authorsData, validTargets),
  ];
}

function splitHref(href: string): { pathname: string; suffix: string } {
  const match = href.match(/^([^?#]*)(.*)$/);
  return { pathname: match ? match[1] : href, suffix: match ? match[2] : '' };
}

export function validateParentLink(
  parent: unknown,
  filePath: string,
  validTargets: Set<string>,
  sourceUrlPath: string,
): string | null {
  if (typeof parent === 'string' && splitHref(parent).pathname === '') {
    return `${filePath}: broken parent link: "${parent}"`;
  }

  const resolvedTarget = resolveParentLinkTarget(parent, sourceUrlPath);
  if (!resolvedTarget) {
    return null;
  }

  if (!validTargets.has(resolvedTarget)) {
    return `${filePath}: broken parent link: "${parent}"`;
  }

  return null;
}

export function resolveParentLinkTarget(
  parent: unknown,
  sourceUrlPath: string,
): string | null {
  if (!parent || typeof parent !== 'string') {
    return null;
  }

  const { pathname } = splitHref(parent);
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
