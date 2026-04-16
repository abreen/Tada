import type MarkdownIt from 'markdown-it';
import type Token from 'markdown-it/lib/token.mjs';
import path from 'path';
import { isInternalLink } from './utils/link';
import { makeLogger } from './log';

const log = makeLogger(import.meta.url);
const rawHtmlHrefPattern =
  /<a\b[^>]*\bhref\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s"'=<>`]+))/gi;

interface ValidateInternalLinksOptions {
  enabled?: boolean;
  filePath?: string;
  sourceUrlPath?: string;
  validTargets?: Set<string>;
  codeExtensions?: string[];
}

function stripQueryAndHash(href: string): string {
  return href.split('#')[0].split('?')[0];
}

function normalizePathname(pathname: string): string {
  const normalized = path.posix.normalize(pathname);
  if (normalized === '.') {
    return '/';
  }
  return normalized.startsWith('/') ? normalized : `/${normalized}`;
}

function createCodeExtPattern(codeExtensions: string[]): RegExp | null {
  const escaped = codeExtensions.map(ext =>
    ext.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
  );
  if (escaped.length === 0) {
    return null;
  }
  return new RegExp(`\\.(${escaped.join('|')})$`, 'i');
}

function rewriteCodeLink(
  pathname: string,
  codeExtPattern: RegExp | null,
): string {
  if (!codeExtPattern || !codeExtPattern.test(pathname)) {
    return pathname;
  }

  return `${pathname}.html`;
}

function resolveLinkPath(
  sourceUrlPath: string,
  rawHref: string,
  codeExtPattern: RegExp | null,
): string | null {
  const hrefPath = stripQueryAndHash(rawHref.trim());
  if (!hrefPath) {
    return null;
  }

  const sourceDir = path.posix.dirname(sourceUrlPath);
  const resolved = hrefPath.startsWith('/')
    ? normalizePathname(hrefPath)
    : normalizePathname(path.posix.join(sourceDir, hrefPath));

  // Decode percent-encoded characters so the resolved path can be matched
  // against `validTargets`, which contains raw filesystem-derived paths.
  // markdown-it's normalizeLink percent-encodes hrefs, so a link like
  // `[x](/my notes.md)` arrives here as `/my%20notes.md`.
  let decoded: string;
  try {
    decoded = normalizePathname(decodeURIComponent(resolved));
  } catch {
    decoded = resolved;
  }

  return rewriteCodeLink(decoded, codeExtPattern);
}

function getDirectoryIndexPath(pathname: string): string {
  return normalizePathname(path.posix.join(pathname, 'index.html'));
}

export default function validateInternalLinks(
  md: MarkdownIt,
  options: ValidateInternalLinksOptions = {},
): void {
  const {
    enabled = true,
    filePath,
    sourceUrlPath,
    validTargets,
    codeExtensions = [],
  } = options;

  if (!enabled) {
    return;
  }

  if (!filePath || !sourceUrlPath || !(validTargets instanceof Set)) {
    throw new Error(
      'validate-internal-links-plugin requires filePath, sourceUrlPath, and validTargets',
    );
  }

  const codeExtPattern = createCodeExtPattern(codeExtensions);
  const seenErrors = new Set<string>();

  function reportBrokenLink(rawHref: string, resolvedPath: string): void {
    const key = `${rawHref}|${resolvedPath}`;
    if (seenErrors.has(key)) {
      return;
    }
    seenErrors.add(key);

    log.error`${filePath}: broken internal link: "${rawHref}" (resolved to "${resolvedPath}")`;
  }

  function reportDirectoryLink(
    rawHref: string,
    resolvedPath: string,
    indexPath: string,
  ): void {
    const key = `${rawHref}|${resolvedPath}|directory`;
    if (seenErrors.has(key)) {
      return;
    }
    seenErrors.add(key);

    log.error`${filePath}: directory link must reference index.html explicitly: "${rawHref}" (resolved to "${resolvedPath}", expected "${indexPath}")`;
  }

  function validateHref(rawHref: string): void {
    if (!rawHref) {
      return;
    }

    const href = rawHref.trim();
    if (!href || !isInternalLink(href)) {
      return;
    }

    const resolvedPath = resolveLinkPath(sourceUrlPath!, href, codeExtPattern);
    if (!resolvedPath) {
      return;
    }

    const directoryIndexPath = getDirectoryIndexPath(resolvedPath);
    if (
      directoryIndexPath !== resolvedPath &&
      validTargets!.has(directoryIndexPath)
    ) {
      reportDirectoryLink(rawHref, resolvedPath, directoryIndexPath);
      return;
    }

    if (!validTargets!.has(resolvedPath)) {
      // If code extension rewriting changed the path, check the original
      // path too. Public files with code extensions are copied as-is and
      // do not produce .html versions.
      if (codeExtPattern) {
        const unrewritten = resolveLinkPath(sourceUrlPath!, href, null);
        if (unrewritten && validTargets!.has(unrewritten)) {
          return;
        }
      }
      reportBrokenLink(rawHref, resolvedPath);
    }
  }

  function validateToken(token: Token): void {
    if (token.type === 'link_open') {
      const href = token.attrGet('href');
      if (href) {
        validateHref(href);
      }
    } else if (token.type === 'html_block' || token.type === 'html_inline') {
      token.content.replace(
        rawHtmlHrefPattern,
        (_, doubleQuotedHref, singleQuotedHref, unquotedHref) => {
          validateHref(doubleQuotedHref ?? singleQuotedHref ?? unquotedHref);
          return _;
        },
      );
    }

    token.children?.forEach(validateToken);
  }

  md.core.ruler.push('validate_internal_links', state => {
    state.tokens.forEach(validateToken);

    if (seenErrors.size > 0) {
      throw new Error(
        `${filePath}: found ${seenErrors.size} broken internal link(s)`,
      );
    }
  });
}
