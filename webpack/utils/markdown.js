const MarkdownIt = require('markdown-it');
const { convertMarkdown: curlyQuote } = require('quote-quote');
const textToId = require('../text-to-id');
const { getHighlighter } = require('./shiki-highlighter');

function capitalize(str) {
  if (str.length < 2) {
    return str;
  }

  return str[0].toUpperCase() + str.slice(1);
}

function createMarkdown(siteVariables, options = {}) {
  const { validatorOptions = {} } = options;
  const markdown = new MarkdownIt({ html: true, typographer: true })
    .use(require('../heading-subtitle-plugin'))
    .use(require('markdown-it-anchor'), { tabIndex: false })
    .use(require('markdown-it-footnote'))
    .use(require('markdown-it-deflist'))
    .use(require('../deflist-id-plugin'))
    .use(require('../external-links-plugin'), siteVariables)
    .use(require('../validate-internal-links-plugin'), validatorOptions)
    .use(require('../apply-base-path-plugin'), siteVariables)
    .use(require('../toc-plugin').tocPlugin)
    .use(require('markdown-it-container'), 'details', {
      marker: '<',
      validate: function (params) {
        return params.trim().match(/^details\s+(.*)$/);
      },

      render: function (tokens, idx) {
        var m = tokens[idx].info.trim().match(/^details\s+(.*)$/);

        if (tokens[idx].nesting === 1) {
          return (
            '<details><summary>' +
            markdown.renderInline(m[1]) +
            '</summary><div class="content">\n'
          );
        } else {
          return '</div></details>\n';
        }
      },
    })
    .use(require('markdown-it-container'), 'section', {
      marker: ':',
      validate: function (params) {
        return params.trim().match(/^section$/);
      },
      render: function (tokens, idx) {
        if (tokens[idx].nesting === 1) {
          return '<section>\n';
        } else {
          return '</section>\n';
        }
      },
    });

  const usedIds = new Map();
  markdown.use(require('markdown-it-container'), 'alert', {
    marker: '!',
    validate: function (params) {
      return params.trim().match(/^(note|warning)\s*"?(.+)?"?$/);
    },
    render: function (tokens, idx) {
      const matches = tokens[idx].info
        .trim()
        .match(/^(note|warning)\s*"?(.+)?"?$/);

      if (tokens[idx].nesting === 1) {
        const classNames = ['alert'];
        const type = matches && matches[1]?.trim();
        if (type) {
          classNames.push(type);
        }

        const title = matches && matches[2]?.trim();

        let html = `<div class="${classNames.join(' ')}">`;
        if (title) {
          const baseId = textToId(title);
          const count = (usedIds.get(baseId) ?? 0) + 1;
          usedIds.set(baseId, count);
          const titleId = count === 1 ? baseId : `${baseId}-${count}`;
          const renderedTitle = markdown.utils.escapeHtml(curlyQuote(title));
          html += `<p class="title" id="${titleId}">${renderedTitle}</p>\n`;
        } else {
          const defaultTitle = capitalize(type);
          html += `<p class="title">${defaultTitle}</p>\n`;
        }
        html += '<div class="content">\n';
        return html;
      } else {
        return '</div></div>\n';
      }
    },
  });

  markdown.use(require('markdown-it-container'), 'question', {
    marker: '?',
    validate: function (params) {
      return params.trim().match(/^question\s+(.+)$/);
    },
    render: function (tokens, idx) {
      const m = tokens[idx].info.trim().match(/^question\s+(.+)$/);
      if (tokens[idx].nesting === 1) {
        const question = markdown.renderInline(m[1]);
        return (
          '<div class="question">' +
          '<p class="question-q"><span class="question-label">Q.</span><span>' +
          question +
          '</span></p>' +
          '<div class="question-a">' +
          '<p class="question-a-label">A.</p>' +
          '<div class="question-a-body" data-pagefind-ignore>\n'
        );
      } else {
        return '</div></div></div>\n';
      }
    },
  });

  /*
   * Customize markdown-it-footnote renderer
   */
  markdown.renderer.rules.footnote_block_open = () =>
    '<div class="footnotes"><p class="title">Footnotes</p><ol>';

  markdown.renderer.rules.footnote_block_close = () => '</ol></div>';

  // Change appearance of reference
  const caption = markdown.renderer.rules.footnote_caption;
  markdown.renderer.rules.footnote_caption = (...args) => {
    const str = caption(...args);
    return str.slice(1, str.length - 1);
  };

  const footnoteRef = markdown.renderer.rules.footnote_ref;
  markdown.renderer.rules.footnote_ref = (...args) =>
    footnoteRef(...args)
      .replace('<sup class="footnote-ref">', '')
      .replace('</sup>', '')
      .replace('<a href="', '<a class="footnote-ref" href="');

  const footnoteAnchor = markdown.renderer.rules.footnote_anchor;
  markdown.renderer.rules.footnote_anchor = (...args) =>
    footnoteAnchor(...args).replace('\u21a9\uFE0E', '\u2191');

  /*
   * Customize lists (add wrapper element)
   */
  const proxy = (tokens, idx, options, env, self) =>
    self.renderToken(tokens, idx, options);

  const itemOpen = markdown.renderer.rules.list_item_open || proxy;
  markdown.renderer.rules.list_item_open = (
    tokens,
    idx,
    options,
    env,
    self,
  ) => {
    return (
      itemOpen(tokens, idx, options, env, self) +
      '<div class="styled-list-item">'
    );
  };

  const itemClose = markdown.renderer.rules.list_item_close || proxy;
  markdown.renderer.rules.list_item_close = (...args) => {
    return '</div>' + itemClose(...args);
  };

  const bulletListOpen = markdown.renderer.rules.bullet_list_open || proxy;
  markdown.renderer.rules.bullet_list_open = (
    tokens,
    idx,
    options,
    env,
    self,
  ) => {
    tokens[idx].attrJoin('class', 'styled-list');
    return bulletListOpen(tokens, idx, options, env, self);
  };

  const orderedListOpen = markdown.renderer.rules.ordered_list_open || proxy;
  markdown.renderer.rules.ordered_list_open = (
    tokens,
    idx,
    options,
    env,
    self,
  ) => {
    tokens[idx].attrJoin('class', 'styled-list');
    return orderedListOpen(tokens, idx, options, env, self);
  };

  markdown.renderer.rules.fence = (tokens, idx) => {
    const token = tokens[idx];
    const lang = token.info.trim().split(/\s+/)[0] || 'text';
    const code = token.content;
    const highlighter = getHighlighter();
    const useLang = highlighter.getLoadedLanguages().includes(lang)
      ? lang
      : 'text';
    return highlighter.codeToHtml(code, {
      lang: useLang,
      themes: { light: 'github-light', dark: 'github-dark' },
      defaultColor: false,
    });
  };

  return markdown;
}

module.exports = { createMarkdown };
