import type MarkdownIt from 'markdown-it';
import type Token from 'markdown-it/lib/token.mjs';
import { makeLogger } from './log';
import type { SiteVariables } from './types';

const log = makeLogger(__filename);

export default function externalLinks(
  md: MarkdownIt,
  siteVariables: SiteVariables,
): void {
  function addClass(token: Token): void {
    if (token.type === 'link_open') {
      const href = token.attrGet('href');
      if (!href) {
        return;
      }

      if (href.match(/^https?:\/\/.*$/)) {
        const url = new URL(href);
        if (!siteVariables.internalDomains?.includes(url.host)) {
          const classAttr = token.attrGet('class');
          let newClassAttr;

          if (classAttr) {
            newClassAttr = classAttr + ' external';
          } else {
            newClassAttr = 'external';
          }

          log.debug`${href} -> "${newClassAttr}"`;
          token.attrSet('class', newClassAttr);

          log.debug`${href} -> target="_blank"`;
          token.attrSet('target', '_blank');
        }
      }
    }

    token.children?.map(addClass);
  }

  md.core.ruler.push('external_links', state => {
    state.tokens.map(addClass);
  });
}
