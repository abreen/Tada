import path from 'path';
import type MarkdownIt from 'markdown-it';
import type Token from 'markdown-it/lib/token.mjs';
import { JSDOM } from 'jsdom';
import { createApplyBasePath } from './utils/paths';
import { getExtensionToShikiLanguage } from './site-variables';
import { isInternalLink } from './utils/link';
import { makeLogger } from './log';
import type { SiteVariables } from './types';

const log = makeLogger(import.meta.url);

function serializeStartTag(element: Element): string {
  const attrs = Array.from(element.attributes).map(attr =>
    attr.value === '' ? attr.name : `${attr.name}="${attr.value}"`,
  );
  return `<${element.tagName.toLowerCase()}${attrs.length > 0 ? ` ${attrs.join(' ')}` : ''}>`;
}

function isStandaloneOpeningAnchorTag(html: string): boolean {
  if (!/^<a\b/i.test(html)) {
    return false;
  }

  let i = 2;
  let quote: '"' | "'" | null = null;

  while (i < html.length) {
    const char = html[i];
    if (quote) {
      if (char === quote) {
        quote = null;
      }
      i += 1;
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      i += 1;
      continue;
    }

    if (char === '>') {
      return html.slice(i + 1).trim() === '';
    }

    i += 1;
  }

  return false;
}

interface ApplyBasePathOptions {
  literateJavaOutputPaths?: Set<string>;
  sourceUrlPath?: string;
  validTargets?: Set<string>;
}

export default function applyBasePathPlugin(
  md: MarkdownIt,
  siteVariables: SiteVariables,
  pluginOptions: ApplyBasePathOptions = {},
): void {
  const applyBasePath = createApplyBasePath(siteVariables);
  const literateJavaOutputPaths = pluginOptions.literateJavaOutputPaths;
  const sourceUrlPath = pluginOptions.sourceUrlPath;
  const validTargets = pluginOptions.validTargets;

  function rewriteInternalHref(href: string): string {
    const resolveAgainstSource = (p: string): string =>
      p.startsWith('/')
        ? p
        : path.posix.join(path.posix.dirname(sourceUrlPath!), p);

    const match = href.match(/^([^?#]*)(.*)$/);
    const pathname = match ? match[1] : href;
    const suffix = match ? match[2] : '';
    let modifiedPath = pathname;

    for (const ext of Object.keys(getExtensionToShikiLanguage(siteVariables))) {
      if (modifiedPath.endsWith(`.${ext}`)) {
        if (literateJavaOutputPaths && sourceUrlPath) {
          const resolved = resolveAgainstSource(modifiedPath);
          if (literateJavaOutputPaths.has(resolved)) {
            break;
          }
        }
        // Only rewrite if the .html version exists. Public files with
        // code extensions are copied as-is and have no .html page.
        if (validTargets && sourceUrlPath) {
          const resolved = resolveAgainstSource(modifiedPath);
          if (!validTargets.has(`${resolved}.html`)) {
            break;
          }
        }
        modifiedPath += '.html';
        break;
      }
    }

    return modifiedPath + suffix;
  }

  function checkAndApplyBasePath(token: Token): void {
    if (token.type === 'link_open') {
      const href = token.attrGet('href');
      if (!href) {
        return;
      }

      if (href.startsWith('/')) {
        const modifiedHref = rewriteInternalHref(href);
        const afterApply = applyBasePath(modifiedHref);
        log.debug`Applying base path: ${href} -> ${afterApply}`;
        token.attrSet('href', afterApply);
      } else if (isInternalLink(href)) {
        // Relative link: only rewrite code extensions, don't apply base path
        const modifiedHref = rewriteInternalHref(href);
        if (modifiedHref !== href) {
          log.debug`Rewriting internal link: ${href} -> ${modifiedHref}`;
          token.attrSet('href', modifiedHref);
        }
      }
    } else if (token.type === 'image') {
      const src = token.attrGet('src');
      if (src && src.startsWith('/')) {
        const afterApply = applyBasePath(src);
        log.debug`Applying base path to image: ${src} -> ${afterApply}`;
        token.attrSet('src', afterApply);
      }
    } else if (token.type === 'html_block' || token.type === 'html_inline') {
      if (isStandaloneOpeningAnchorTag(token.content)) {
        const dom = new JSDOM(`<body>${token.content}__tada__</a></body>`);
        const anchor = dom.window.document.body.querySelector('a[href]');
        const href = anchor?.getAttribute('href');
        if (anchor && href && isInternalLink(href)) {
          const rewrittenHref = rewriteInternalHref(href);
          const finalHref = href.startsWith('/')
            ? applyBasePath(rewrittenHref)
            : rewrittenHref;
          log.debug`Rewriting raw HTML anchor: ${href} -> ${finalHref}`;
          anchor.setAttribute('href', finalHref);
          token.content = serializeStartTag(anchor);
        }
      } else {
        const dom = new JSDOM(`<body>${token.content}</body>`);
        const { document } = dom.window;
        let changed = false;

        for (const anchor of document.body.querySelectorAll('a[href]')) {
          const href = anchor.getAttribute('href');
          if (href && isInternalLink(href)) {
            const rewrittenHref = rewriteInternalHref(href);
            const finalHref = href.startsWith('/')
              ? applyBasePath(rewrittenHref)
              : rewrittenHref;
            log.debug`Rewriting raw HTML anchor: ${href} -> ${finalHref}`;
            anchor.setAttribute('href', finalHref);
            changed = true;
          }
        }

        for (const image of document.body.querySelectorAll('img[src]')) {
          const src = image.getAttribute('src');
          if (src && src.startsWith('/')) {
            const afterApply = applyBasePath(src);
            log.debug`Applying base path to raw HTML image: ${src} -> ${afterApply}`;
            image.setAttribute('src', afterApply);
            changed = true;
          }
        }

        if (changed) {
          token.content = document.body.innerHTML;
        }
      }
    }

    token.children?.forEach(checkAndApplyBasePath);
  }

  md.core.ruler.push('apply_base_path', state => {
    state.tokens.forEach(checkAndApplyBasePath);
  });
}
