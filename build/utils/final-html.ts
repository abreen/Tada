import path from 'path';
import { decodeHTMLAttribute } from 'entities';
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
  validInternalTargets: ReadonlySet<string>;
  generatedPageTargets?: ReadonlySet<string>;
  codePageSourceTargets?: ReadonlySet<string>;
  literateJavaOutputPaths?: ReadonlySet<string>;
  dependencyCollector?: RenderDependencyCollector;
}

interface FinalizedHtmlPage {
  html: string;
  analysis: HtmlOutputAnalysis;
}

type RewriterElement = HTMLRewriterTypes.Element;

const HTML_NAMESPACE = 'http://www.w3.org/1999/xhtml';

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
  codeExtensions,
  codePageSourceTargets,
  literateJavaOutputPaths,
  skipCodeLinkRewrite,
}: {
  href: string;
  sourceUrlPath: string;
  codeExtensions: string[];
  codePageSourceTargets?: ReadonlySet<string>;
  literateJavaOutputPaths?: ReadonlySet<string>;
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
    } else if (codePageSourceTargets?.has(resolvedPath)) {
      finalPathname = `${pathname}.html`;
      resolvedTarget = htmlTarget;
    }
  }

  return { finalHref: `${finalPathname}${suffix}`, resolvedTarget };
}

// HTMLRewriter exposes attribute values exactly as authored, without decoding
// character references, so decode them the way an HTML parser would. It also
// reports empty values as null.
function getAttributeValue(
  element: RewriterElement,
  name: string,
): string | null {
  const value = element.getAttribute(name);
  if (value === null) {
    return element.hasAttribute(name) ? '' : null;
  }
  return value.includes('&') ? decodeHTMLAttribute(value) : value;
}

// HTMLRewriter writes new values verbatim apart from escaping double quotes.
function setAttributeValue(
  element: RewriterElement,
  name: string,
  value: string,
): void {
  element.setAttribute(name, value.replaceAll('&', '&amp;'));
}

export function finalizeHtmlPage({
  filePath,
  html,
  siteVariables,
  sourceUrlPath,
  validInternalTargets,
  literateJavaOutputPaths,
  generatedPageTargets,
  codePageSourceTargets,
  dependencyCollector,
}: FinalizeHtmlPageOptions): FinalizedHtmlPage {
  const applyBasePath = createApplyBasePath(siteVariables);
  const codeExtensions = Object.keys(
    getExtensionToShikiLanguage(siteVariables),
  );
  const analysis: HtmlOutputAnalysis = { outgoingTargets: new Set() };
  // Content link targets are recorded before classification targets, matching
  // the order of the original separate passes.
  const classificationTargets: string[] = [];

  const origin = new URL(siteVariables.base).origin;
  // Source paths contain no query or fragment. Escape filesystem delimiters
  // while preserving the percent-encoded segments supplied by code pages.
  const sourcePathname = sourceUrlPath.replace(/[?#]/g, encodeURIComponent);
  const sourceUrl = new URL(applyBasePath(sourcePathname), origin);
  const basePath = (siteVariables.basePath || '/').replace(/\/$/, '');

  // Rewrites an href and returns its final value. Anchors inside `main.body`
  // are page content: they are resolved, rewritten to code pages, and
  // validated. Other hrefs only receive the base path.
  function rewriteHref(
    element: RewriterElement,
    href: string,
    isContent: boolean,
  ): string {
    const isAnchor =
      element.tagName === 'a' && element.namespaceURI === HTML_NAMESPACE;

    if (isAnchor && isContent) {
      const { finalHref, resolvedTarget } = resolveAnchorTarget({
        href,
        sourceUrlPath,
        codeExtensions,
        codePageSourceTargets,
        literateJavaOutputPaths,
        skipCodeLinkRewrite: element.hasAttribute('download'),
      });
      const rewrittenHref = finalHref.startsWith('/')
        ? rewriteAbsoluteHrefWithBasePath(finalHref, applyBasePath)
        : finalHref;

      if (rewrittenHref !== href) {
        setAttributeValue(element, 'href', rewrittenHref);
      }

      if (resolvedTarget) {
        analysis.outgoingTargets.add(resolvedTarget);

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

      return rewrittenHref;
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
      setAttributeValue(element, 'href', rewrittenHref);
    }
    return rewrittenHref;
  }

  // Recomputes the generated-page marker from an anchor's final href.
  function classifyAnchor(anchor: RewriterElement, href: string | null): void {
    if (anchor.hasAttribute('data-tada-page')) {
      anchor.removeAttribute('data-tada-page');
    }
    if (href === null) {
      return;
    }
    let url: URL;
    try {
      url = new URL(href, sourceUrl);
    } catch {
      return;
    }
    if (url.origin !== origin) {
      return;
    }
    if (
      basePath &&
      url.pathname !== basePath &&
      !url.pathname.startsWith(`${basePath}/`)
    ) {
      return;
    }
    let target = url.pathname.slice(basePath.length) || '/';
    try {
      target = decodeURIComponent(target);
    } catch {
      // Preserve malformed encodings for classification as authored.
    }
    target = normalizeOutputPath(target);
    if (generatedPageTargets) {
      classificationTargets.push(target);
    }
    if (
      generatedPageTargets?.has(target) &&
      !anchor.hasAttribute('target') &&
      !anchor.hasAttribute('download')
    ) {
      anchor.setAttribute('data-tada-page', '');
    }
  }

  // HTMLRewriter edits the original markup in place. It reads `<noscript>`
  // contents as raw text, so a nested rewriter parses them as markup (as a
  // parser with scripting disabled would), inheriting whether the element is
  // inside `main.body`.
  function rewrite(input: string, initialContentDepth: number): string {
    let contentDepth = initialContentDepth;
    let noscriptSource = '';

    return new HTMLRewriter()
      .on('main.body', {
        element(element) {
          contentDepth++;
          element.onEndTag(() => {
            contentDepth--;
          });
        },
      })
      .on('[href]', {
        element(element) {
          const href = getAttributeValue(element, 'href');
          const finalHref = href
            ? rewriteHref(element, href, contentDepth > 0)
            : href;
          if (element.tagName === 'a') {
            classifyAnchor(element, finalHref);
          }
        },
      })
      .on('a:not([href])', {
        element(element) {
          classifyAnchor(element, null);
        },
      })
      .on('[src]', {
        element(element) {
          const src = getAttributeValue(element, 'src');
          if (!src) {
            return;
          }
          const rewrittenSrc = rewriteAbsoluteSrcWithBasePath(
            src,
            applyBasePath,
          );
          if (rewrittenSrc !== src) {
            setAttributeValue(element, 'src', rewrittenSrc);
          }
        },
      })
      .on('noscript', {
        text(chunk) {
          noscriptSource += chunk.text;
          if (!chunk.lastInTextNode) {
            chunk.remove();
            return;
          }
          chunk.replace(rewrite(noscriptSource, contentDepth), { html: true });
          noscriptSource = '';
        },
      })
      .transform(input);
  }

  const finalizedHtml = rewrite(html, 0);
  for (const target of classificationTargets) {
    dependencyCollector?.internalTargets?.add(target);
  }

  return { html: finalizedHtml, analysis };
}
