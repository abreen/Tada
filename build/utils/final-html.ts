import path from 'path';
import { JSDOM } from 'jsdom';
import { getExtensionToShikiLanguage } from '../site-variables';
import { createApplyBasePath, normalizeOutputPath } from './paths';
import { isInternalLink } from './link';
import type {
  HtmlOutputAnalysis,
  RenderDependencyCollector,
  SiteVariables,
} from '../types';

interface FinalizeHtmlPageOptions {
  filePath: string;
  html: string;
  siteVariables: SiteVariables;
  sourceUrlPath: string;
  validInternalTargets: Set<string>;
  literateJavaOutputPaths?: Set<string>;
  dependencyCollector?: RenderDependencyCollector;
}

interface FinalizedHtmlPage {
  html: string;
  analysis: HtmlOutputAnalysis;
}

function splitHref(href: string): { pathname: string; suffix: string } {
  const match = href.match(/^([^?#]*)(.*)$/);
  return { pathname: match ? match[1] : href, suffix: match ? match[2] : '' };
}

function resolvePathname(
  sourceUrlPath: string,
  pathname: string,
): string | null {
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

function getDirectoryIndexPath(pathname: string): string {
  return normalizeOutputPath(path.posix.join(pathname, 'index.html'));
}

function hasMappedCodeExtension(
  pathname: string,
  codeExtensions: string[],
): boolean {
  const lower = pathname.toLowerCase();
  return codeExtensions.some(ext => lower.endsWith(`.${ext.toLowerCase()}`));
}

function rewriteAbsoluteHrefWithBasePath(
  href: string,
  applyBasePath: (subPath: string) => string,
): string {
  const { pathname, suffix } = splitHref(href);
  if (!pathname.startsWith('/') || pathname.startsWith('//')) {
    return href;
  }
  return `${applyBasePath(pathname)}${suffix}`;
}

function rewriteAbsoluteSrcWithBasePath(
  src: string,
  applyBasePath: (subPath: string) => string,
): string {
  if (!src.startsWith('/') || src.startsWith('//')) {
    return src;
  }
  return applyBasePath(src);
}

function resolveAnchorTarget({
  href,
  sourceUrlPath,
  validInternalTargets,
  codeExtensions,
  literateJavaOutputPaths,
  skipCodeLinkRewrite,
}: {
  href: string;
  sourceUrlPath: string;
  validInternalTargets: Set<string>;
  codeExtensions: string[];
  literateJavaOutputPaths?: Set<string>;
  skipCodeLinkRewrite: boolean;
}): { finalHref: string; resolvedTarget: string | null } {
  if (!isInternalLink(href)) {
    return { finalHref: href, resolvedTarget: null };
  }

  const { pathname, suffix } = splitHref(href);
  const resolvedPath = resolvePathname(sourceUrlPath, pathname);
  if (!resolvedPath) {
    return { finalHref: href, resolvedTarget: null };
  }

  let finalPathname = pathname;
  let resolvedTarget = resolvedPath;
  const mappedCodePath =
    !skipCodeLinkRewrite && hasMappedCodeExtension(pathname, codeExtensions);

  if (mappedCodePath) {
    const htmlTarget = `${resolvedPath}.html`;
    if (literateJavaOutputPaths?.has(resolvedPath)) {
      resolvedTarget = resolvedPath;
    } else if (validInternalTargets.has(htmlTarget)) {
      finalPathname = `${pathname}.html`;
      resolvedTarget = htmlTarget;
    } else if (validInternalTargets.has(resolvedPath)) {
      resolvedTarget = resolvedPath;
    } else {
      resolvedTarget = htmlTarget;
    }
  }

  return { finalHref: `${finalPathname}${suffix}`, resolvedTarget };
}

export function finalizeHtmlPage({
  filePath,
  html,
  siteVariables,
  sourceUrlPath,
  validInternalTargets,
  literateJavaOutputPaths,
  dependencyCollector,
}: FinalizeHtmlPageOptions): FinalizedHtmlPage {
  const dom = new JSDOM(html);
  const document = dom.window.document;
  const applyBasePath = createApplyBasePath(siteVariables);
  const codeExtensions = Object.keys(
    getExtensionToShikiLanguage(siteVariables),
  );
  const analysis: HtmlOutputAnalysis = { outgoingTargets: new Set() };

  for (const element of document.querySelectorAll('[href]')) {
    const href = element.getAttribute('href');
    if (!href) {
      continue;
    }

    const isAnchor = element.tagName === 'A';
    const isContentAnchor = isAnchor && element.closest('main.body') !== null;

    if (isContentAnchor) {
      const { finalHref, resolvedTarget } = resolveAnchorTarget({
        href,
        sourceUrlPath,
        validInternalTargets,
        codeExtensions,
        literateJavaOutputPaths,
        skipCodeLinkRewrite: element.hasAttribute('download'),
      });
      const rewrittenHref = finalHref.startsWith('/')
        ? rewriteAbsoluteHrefWithBasePath(finalHref, applyBasePath)
        : finalHref;

      if (rewrittenHref !== href) {
        element.setAttribute('href', rewrittenHref);
      }

      if (resolvedTarget) {
        if (isAnchor) {
          analysis.outgoingTargets.add(resolvedTarget);
        }

        const directoryIndexPath = getDirectoryIndexPath(resolvedTarget);
        if (
          directoryIndexPath !== resolvedTarget &&
          validInternalTargets.has(directoryIndexPath)
        ) {
          throw new Error(
            `${filePath}: directory link must reference index.html explicitly: "${href}" (resolved to "${resolvedTarget}", expected "${directoryIndexPath}")`,
          );
        }

        if (!validInternalTargets.has(resolvedTarget)) {
          throw new Error(
            `${filePath}: broken internal link: "${href}" (resolved to "${resolvedTarget}")`,
          );
        }

        dependencyCollector?.internalTargets?.add(resolvedTarget);
      }

      continue;
    }

    if (isAnchor && isInternalLink(href)) {
      const { pathname } = splitHref(href);
      const resolvedTarget = resolvePathname(sourceUrlPath, pathname);
      if (resolvedTarget) {
        analysis.outgoingTargets.add(resolvedTarget);
      }
    }

    const rewrittenHref = rewriteAbsoluteHrefWithBasePath(href, applyBasePath);
    if (rewrittenHref !== href) {
      element.setAttribute('href', rewrittenHref);
    }
  }

  for (const element of document.querySelectorAll('[src]')) {
    const src = element.getAttribute('src');
    if (!src) {
      continue;
    }

    const rewrittenSrc = rewriteAbsoluteSrcWithBasePath(src, applyBasePath);
    if (rewrittenSrc !== src) {
      element.setAttribute('src', rewrittenSrc);
    }
  }

  const doctype = document.doctype;
  const doctypePrefix = doctype
    ? `<!DOCTYPE ${doctype.name}${
        doctype.publicId ? ` PUBLIC "${doctype.publicId}"` : ''
      }${doctype.systemId ? ` "${doctype.systemId}"` : ''}>`
    : '';

  return {
    html: `${doctypePrefix}${document.documentElement.outerHTML}`,
    analysis,
  };
}
