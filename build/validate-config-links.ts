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
    const avatarPath = normalizeOutputPath(author.avatar);
    if (!validTargets.has(avatarPath)) {
      errors.push(
        `authors.json: broken avatar path for "${key}": "${author.avatar}"`,
      );
    }

    if (author.url) {
      const urlPath = normalizeOutputPath(author.url);
      if (!validTargets.has(urlPath)) {
        errors.push(`authors.json: broken url for "${key}": "${author.url}"`);
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

export function validateParentLink(
  parent: unknown,
  filePath: string,
  validTargets: Set<string>,
): string | null {
  if (!parent || typeof parent !== 'string') {
    return null;
  }

  const normalized = normalizeOutputPath(parent);
  if (!validTargets.has(normalized)) {
    return `${filePath}: broken parent link: "${parent}"`;
  }

  return null;
}
