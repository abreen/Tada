import path from 'path';
import type MarkdownIt from 'markdown-it';
import type Token from 'markdown-it/lib/token.mjs';
import { createApplyBasePath } from './utils/paths';
import { isFeatureEnabled } from './features';
import { makeLogger } from './log';
import type { SiteVariables } from './types';

const log = makeLogger(__filename);

interface ApplyBasePathOptions {
  literateJavaOutputPaths?: Set<string>;
  sourceUrlPath?: string;
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

  function rewriteInternalHref(href: string): string {
    const match = href.match(/^([^?#]*)(.*)$/);
    const pathname = match ? match[1] : href;
    const suffix = match ? match[2] : '';
    let modifiedPath = pathname;

    if (rewriteCodeLinks) {
      for (const ext of Object.keys(siteVariables.codeLanguages ?? {})) {
        if (modifiedPath.endsWith(`.${ext}`)) {
          if (literateJavaOutputPaths && sourceUrlPath) {
            const resolved = modifiedPath.startsWith('/')
              ? modifiedPath
              : path.posix.join(
                  path.posix.dirname(sourceUrlPath),
                  modifiedPath,
                );
            if (literateJavaOutputPaths.has(resolved)) {
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
      } else if (
        !href.startsWith('#') &&
        !href.startsWith('//') &&
        !/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(href)
      ) {
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
      token.content = token.content
        .replace(
          /(<a\b[^>]*\bhref=")(\/)([^"]*")/g,
          (match, prefix, slash, rest) => {
            const href = slash + rest.slice(0, -1);
            const afterApply = applyBasePath(href);
            log.debug`Applying base path to a tag href: ${href} -> ${afterApply}`;
            return prefix + afterApply + '"';
          },
        )
        .replace(
          /(<img\b[^>]*\bsrc=")(\/)([^"]*")/g,
          (match, prefix, slash, rest) => {
            const src = slash + rest.slice(0, -1);
            const afterApply = applyBasePath(src);
            log.debug`Applying base path to img tag src: ${src} -> ${afterApply}`;
            return prefix + afterApply + '"';
          },
        );
    }

    token.children?.map(checkAndApplyBasePath);
  }

  md.core.ruler.push('apply_base_path', state => {
    state.tokens.map(checkAndApplyBasePath);
  });
}
