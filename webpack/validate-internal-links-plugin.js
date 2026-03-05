const path = require('path');
const { makeLogger } = require('./log');

const log = makeLogger(__filename);

function stripQueryAndHash(href) {
  return href.split('#')[0].split('?')[0];
}

function isExternalOrAnchor(href) {
  if (!href || href.startsWith('#') || href.startsWith('//')) {
    return true;
  }

  return /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(href);
}

function normalizePathname(pathname) {
  const normalized = path.posix.normalize(pathname);
  if (normalized === '.') {
    return '/';
  }
  return normalized.startsWith('/') ? normalized : `/${normalized}`;
}

function createCodeExtPattern(codeExtensions) {
  const escaped = codeExtensions.map(ext =>
    ext.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
  );
  if (escaped.length === 0) {
    return null;
  }
  return new RegExp(`\\.(${escaped.join('|')})$`, 'i');
}

function rewriteCodeLink(pathname, codeExtPattern) {
  if (!codeExtPattern) {
    return pathname;
  }

  return pathname.replace(codeExtPattern, '.html');
}

function resolveLinkPath(sourceUrlPath, rawHref, codeExtPattern) {
  const hrefPath = stripQueryAndHash(rawHref.trim());
  if (!hrefPath) {
    return null;
  }

  const sourceDir = path.posix.dirname(sourceUrlPath);
  const resolved = hrefPath.startsWith('/')
    ? normalizePathname(hrefPath)
    : normalizePathname(path.posix.join(sourceDir, hrefPath));

  return rewriteCodeLink(resolved, codeExtPattern);
}

function getDirectoryIndexPath(pathname) {
  return normalizePathname(path.posix.join(pathname, 'index.html'));
}

module.exports = function validateInternalLinks(md, options = {}) {
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
  const seenErrors = new Set();

  function reportBrokenLink(rawHref, resolvedPath) {
    const key = `${rawHref}|${resolvedPath}`;
    if (seenErrors.has(key)) {
      return;
    }
    seenErrors.add(key);

    log.error`${filePath}: broken internal link: "${rawHref}" (resolved to "${resolvedPath}")`;
  }

  function reportDirectoryLink(rawHref, resolvedPath, indexPath) {
    const key = `${rawHref}|${resolvedPath}|directory`;
    if (seenErrors.has(key)) {
      return;
    }
    seenErrors.add(key);

    log.error`${filePath}: directory link must reference index.html explicitly: "${rawHref}" (resolved to "${resolvedPath}", expected "${indexPath}")`;
  }

  function validateHref(rawHref) {
    if (!rawHref) {
      return;
    }

    const href = rawHref.trim();
    if (!href || isExternalOrAnchor(href)) {
      return;
    }

    const resolvedPath = resolveLinkPath(sourceUrlPath, href, codeExtPattern);
    if (!resolvedPath) {
      return;
    }

    const directoryIndexPath = getDirectoryIndexPath(resolvedPath);
    if (
      directoryIndexPath !== resolvedPath &&
      validTargets.has(directoryIndexPath)
    ) {
      reportDirectoryLink(rawHref, resolvedPath, directoryIndexPath);
      return;
    }

    if (!validTargets.has(resolvedPath)) {
      reportBrokenLink(rawHref, resolvedPath);
    }
  }

  function validateToken(token) {
    if (token.type === 'link_open') {
      validateHref(token.attrGet('href'));
    } else if (token.type === 'html_block' || token.type === 'html_inline') {
      token.content.replace(/<a\b[^>]*\bhref\s*=\s*"([^"]+)"/gi, (_, href) => {
        validateHref(href);
        return _;
      });
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
};
