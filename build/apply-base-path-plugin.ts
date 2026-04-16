import path from 'path';
import type MarkdownIt from 'markdown-it';
import type Token from 'markdown-it/lib/token.mjs';
import { createApplyBasePath } from './utils/paths';
import { findRawHtmlAttributes } from './utils/raw-html-attributes';
import { isFeatureEnabled } from './features';
import { isInternalLink } from './utils/link';
import { makeLogger } from './log';
import type { SiteVariables } from './types';

const log = makeLogger(import.meta.url);

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
  const rewriteCodeLinks = isFeatureEnabled(siteVariables, 'code');
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

    if (rewriteCodeLinks) {
      for (const ext of Object.keys(siteVariables.codeLanguages ?? {})) {
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
      const matches = findRawHtmlAttributes(
        token.content,
        ['a', 'img'],
        ['href', 'src'],
      );
      if (matches.length > 0) {
        let rewritten = '';
        let lastIndex = 0;
        for (const match of matches) {
          rewritten += token.content.slice(lastIndex, match.valueStart);
          if (match.value.startsWith('/')) {
            const afterApply = applyBasePath(match.value);
            log.debug`Applying base path to raw HTML attribute: ${match.value} -> ${afterApply}`;
            rewritten += afterApply;
          } else {
            rewritten += match.value;
          }
          lastIndex = match.valueEnd;
        }
        rewritten += token.content.slice(lastIndex);
        token.content = rewritten;
      }
    }

    token.children?.forEach(checkAndApplyBasePath);
  }

  md.core.ruler.push('apply_base_path', state => {
    state.tokens.forEach(checkAndApplyBasePath);
  });
}
