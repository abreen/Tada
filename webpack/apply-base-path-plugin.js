const { createApplyBasePath } = require('./utils/paths');
const { makeLogger } = require('./log');

const log = makeLogger(__filename);

module.exports = function externalLinks(md, siteVariables, options = {}) {
  const applyBasePath = createApplyBasePath(siteVariables);
  const rewriteCodeLinks = siteVariables.features?.code !== false;

  function rewriteInternalHref(href) {
    const match = href.match(/^([^?#]*)(.*)$/);
    const pathname = match ? match[1] : href;
    const suffix = match ? match[2] : '';
    let modifiedPath = pathname;

    if (rewriteCodeLinks) {
      // Rewrite code file links to .html links
      for (const ext of Object.keys(siteVariables.codeLanguages)) {
        if (modifiedPath.endsWith(`.${ext}`)) {
          modifiedPath = modifiedPath.replace(
            new RegExp(`\\.${ext}$`),
            '.html',
          );
          break;
        }
      }
    }

    return modifiedPath + suffix;
  }

  function checkAndApplyBasePath(token) {
    if (token.type === 'link_open') {
      const href = token.attrGet('href');

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
      token.content = token.content.replace(
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
};
