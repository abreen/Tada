const { makeLogger } = require('./log');

const log = makeLogger(__filename);

module.exports = function externalLinks(md, siteVariables) {
  function addClass(token) {
    if (token.type === 'link_open') {
      const href = token.attrGet('href');

      if (href.match(/^https?:\/\/.*$/)) {
        const url = new URL(href);
        if (!siteVariables.internalDomains.includes(url.host)) {
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
};
