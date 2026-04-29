import MarkdownIt from 'markdown-it';
import type { Options } from 'markdown-it/lib/index.mjs';
import Token from 'markdown-it/lib/token.mjs';
import type Renderer from 'markdown-it/lib/renderer.mjs';
import { convertMarkdown as curlyQuote } from 'quote-quote';
import markdownItAnchor from 'markdown-it-anchor';
import markdownItFootnote from 'markdown-it-footnote';
import markdownItDeflist from 'markdown-it-deflist';
import markdownItContainer from 'markdown-it-container';
import textToId, { deduplicateId } from '../text-to-id';
import { highlightCode } from './shiki-highlighter';
import { isBundledLanguage, isPlainTextLanguage } from '../site-variables';
import headingSubtitlePlugin from '../heading-subtitle-plugin';
import deflistIdPlugin from '../deflist-id-plugin';
import externalLinksPlugin from '../external-links-plugin';
import { tocPlugin } from '../toc-plugin';
import columnsPlugin from '../columns-plugin';
import markdownItKatex from '@vscode/markdown-it-katex';
import katex from 'katex';
import renderA11yString from 'katex/contrib/render-a11y-string';
import markdownPartialsPlugin from './markdown-partials';
import type { RenderDependencyCollector, SiteVariables } from '../types';

const DETAILS_PATTERN = /^details\s+(.*)$/;
const ALERT_PATTERN = /^(note|warning)(?:\s+"(.+)"|\s+(.+))?$/;
const QUESTION_PATTERN = /^question\s+(.+)$/;
const MULTIPLE_CHOICE_MARKER_LENGTH = 4;

interface CreateMarkdownOptions {
  filePath?: string;
  slides?: boolean;
  validatorOptions?: Record<string, unknown>;
  literateJavaOutputPaths?: Set<string>;
  sourceUrlPath?: string;
  validTargets?: Set<string>;
  templateParams?: Record<string, unknown>;
  dependencyCollector?: RenderDependencyCollector;
}

interface MultipleChoiceOption {
  correct: boolean;
  inline: Token;
}

interface MultipleChoiceMeta {
  question: string;
  options: MultipleChoiceOption[];
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

const MAX_FOOTNOTES = 35;

export function footnoteLabel(oneBasedIndex: number): string {
  if (oneBasedIndex < 1 || oneBasedIndex > MAX_FOOTNOTES) {
    throw new Error(
      `Tada supports at most ${MAX_FOOTNOTES} footnotes per page ` +
        `(9 digits + 26 capital letters), but footnote ${oneBasedIndex} ` +
        `was requested. Reduce the number of footnotes on this page.`,
    );
  }
  if (oneBasedIndex <= 9) {
    return String(oneBasedIndex);
  }
  return String.fromCharCode('A'.charCodeAt(0) + (oneBasedIndex - 10));
}

export function createMarkdown(
  siteVariables: SiteVariables,
  options: CreateMarkdownOptions = {},
): MarkdownIt {
  const { filePath, slides = false } = options;
  const markdown = new MarkdownIt({ html: true, typographer: true })
    .use(headingSubtitlePlugin)
    .use(markdownItAnchor, { tabIndex: false })
    .use(markdownItFootnote)
    .use(markdownItDeflist)
    .use(deflistIdPlugin)
    .use(externalLinksPlugin, siteVariables)
    .use(tocPlugin)
    .use(columnsPlugin)
    .use(markdownItKatex)
    .use(markdownItContainer, 'details', {
      marker: '<',
      validate: function (params: string) {
        return DETAILS_PATTERN.test(params.trim());
      },

      render: function (tokens: Token[], idx: number) {
        const m = tokens[idx].info.trim().match(DETAILS_PATTERN);

        if (tokens[idx].nesting === 1) {
          return (
            '<details><summary>' +
            markdown.renderInline(m![1]) +
            '</summary><div class="content">\n'
          );
        } else {
          return '</div></details>\n';
        }
      },
    })
    .use(markdownItContainer, 'section', {
      marker: ':',
      validate: function (params: string) {
        return !!params.trim().match(/^section$/);
      },
      render: function (tokens: Token[], idx: number) {
        if (tokens[idx].nesting === 1) {
          return '<section>\n';
        } else {
          return '</section>\n';
        }
      },
    });

  if (filePath && options.templateParams) {
    markdown.use(markdownPartialsPlugin, {
      filePath,
      templateParams: options.templateParams,
      dependencyCollector: options.dependencyCollector,
    });
  }

  function createWrapperToken(
    type: string,
    nesting: -1 | 0 | 1,
    attributes: [string, string][],
  ): Token {
    const token = new Token(type, 'div', nesting);
    token.attrs = attributes;
    return token;
  }

  function cloneToken(token: Token): Token {
    const cloned = new Token(token.type, token.tag, token.nesting);
    cloned.attrs = token.attrs?.map(([name, value]) => [name, value]) ?? null;
    cloned.block = token.block;
    cloned.children = token.children?.map(cloneToken) ?? null;
    cloned.content = token.content;
    cloned.hidden = token.hidden;
    cloned.info = token.info;
    cloned.level = token.level;
    cloned.map = token.map ? [token.map[0], token.map[1]] : null;
    cloned.markup = token.markup;
    cloned.meta = token.meta;
    return cloned;
  }

  function parseMultipleChoiceOption(
    inline: Token,
  ): MultipleChoiceOption | null {
    const firstChild = inline.children?.[0];
    if (firstChild?.type !== 'text') {
      return null;
    }

    let correct: boolean;
    if (firstChild.content.startsWith('[ ] ')) {
      correct = false;
    } else if (
      firstChild.content.startsWith('[x] ') ||
      firstChild.content.startsWith('[X] ')
    ) {
      correct = true;
    } else {
      return null;
    }

    const optionInline = cloneToken(inline);
    optionInline.content = inline.content.slice(MULTIPLE_CHOICE_MARKER_LENGTH);
    if (optionInline.children?.[0]?.type === 'text') {
      optionInline.children[0].content = optionInline.children[0].content.slice(
        MULTIPLE_CHOICE_MARKER_LENGTH,
      );
    }
    if (slides) {
      sanitizeTokenForSlides(optionInline);
    }

    return { correct, inline: optionInline };
  }

  function findQuestionCloseIndex(tokens: Token[], openIndex: number): number {
    const level = tokens[openIndex].level;
    for (let i = openIndex + 1; i < tokens.length; i++) {
      const token = tokens[i];
      if (token.type === 'container_question_close' && token.level === level) {
        return i;
      }
    }
    return -1;
  }

  function multipleChoiceError(message: string): Error {
    return new Error(
      (filePath ? `${filePath}: ` : '') + `multiple choice question ${message}`,
    );
  }

  function parseMultipleChoiceQuestion(
    tokens: Token[],
    openIndex: number,
    closeIndex: number,
  ): MultipleChoiceMeta | null {
    const questionMatch = tokens[openIndex].info.trim().match(QUESTION_PATTERN);
    if (!questionMatch) {
      return null;
    }

    const bodyStart = openIndex + 1;
    const bodyEnd = closeIndex - 1;
    if (
      bodyStart > bodyEnd ||
      tokens[bodyStart].type !== 'bullet_list_open' ||
      tokens[bodyEnd].type !== 'bullet_list_close'
    ) {
      return null;
    }

    const options: MultipleChoiceOption[] = [];
    for (let i = bodyStart + 1; i < bodyEnd; ) {
      const listItemOpen = tokens[i];
      const paragraphOpen = tokens[i + 1];
      const inline = tokens[i + 2];
      const paragraphClose = tokens[i + 3];
      const listItemClose = tokens[i + 4];
      if (
        listItemOpen?.type !== 'list_item_open' ||
        paragraphOpen?.type !== 'paragraph_open' ||
        inline?.type !== 'inline' ||
        paragraphClose?.type !== 'paragraph_close' ||
        listItemClose?.type !== 'list_item_close'
      ) {
        return null;
      }

      const option = parseMultipleChoiceOption(inline);
      if (!option) {
        return null;
      }

      options.push(option);
      i += 5;
    }

    if (options.length === 0) {
      return null;
    }

    const correctCount = options.filter(option => option.correct).length;
    if (correctCount !== 1) {
      throw multipleChoiceError(
        `must include exactly one correct option marked with [x], but found ${correctCount}`,
      );
    }

    return { question: questionMatch[1], options };
  }

  function isInlineOnlyTokenStream(tokens: Token[]): boolean {
    return (
      tokens.length === 1 &&
      tokens[0]?.type === 'inline' &&
      tokens[0].level === 0
    );
  }

  function findTagEnd(html: string, start: number): number {
    let quote: '"' | "'" | null = null;

    for (let i = start + 1; i < html.length; i++) {
      const char = html[i];
      if (quote) {
        if (char === quote) {
          quote = null;
        }
        continue;
      }

      if (char === '"' || char === "'") {
        quote = char;
        continue;
      }

      if (char === '>') {
        return i;
      }
    }

    return -1;
  }

  function stripActualHrTags(html: string): string {
    const rawTextTags = new Set(['script', 'style', 'title', 'textarea']);
    const lowerHtml = html.toLowerCase();
    let result = '';
    let index = 0;
    let rawTextTag: string | null = null;

    while (index < html.length) {
      if (rawTextTag) {
        const closeStart = lowerHtml.indexOf(`</${rawTextTag}`, index);
        if (closeStart === -1) {
          result += html.slice(index);
          break;
        }

        result += html.slice(index, closeStart);
        const closeEnd = findTagEnd(html, closeStart);
        if (closeEnd === -1) {
          result += html.slice(closeStart);
          break;
        }

        result += html.slice(closeStart, closeEnd + 1);
        index = closeEnd + 1;
        rawTextTag = null;
        continue;
      }

      const openStart = html.indexOf('<', index);
      if (openStart === -1) {
        result += html.slice(index);
        break;
      }

      result += html.slice(index, openStart);

      if (html.startsWith('<!--', openStart)) {
        const commentEnd = html.indexOf('-->', openStart + 4);
        if (commentEnd === -1) {
          result += html.slice(openStart);
          break;
        }

        result += html.slice(openStart, commentEnd + 3);
        index = commentEnd + 3;
        continue;
      }

      let tagStart = openStart + 1;
      let isClosingTag = false;
      if (html[tagStart] === '/') {
        isClosingTag = true;
        tagStart++;
      }

      if (!/[A-Za-z]/.test(html[tagStart] ?? '')) {
        result += '<';
        index = openStart + 1;
        continue;
      }

      let nameEnd = tagStart;
      while (/[A-Za-z0-9:-]/.test(html[nameEnd] ?? '')) {
        nameEnd++;
      }

      const tagName = html.slice(tagStart, nameEnd).toLowerCase();
      const tagEnd = findTagEnd(html, openStart);
      if (tagEnd === -1) {
        result += html.slice(openStart);
        break;
      }

      const tagText = html.slice(openStart, tagEnd + 1);
      const tagBody = html.slice(openStart + 1, tagEnd);
      const isSelfClosing = /\/\s*$/.test(tagBody);

      if (tagName === 'hr' && !isClosingTag) {
        index = tagEnd + 1;
        continue;
      }

      result += tagText;
      index = tagEnd + 1;

      if (!isClosingTag && !isSelfClosing && rawTextTags.has(tagName)) {
        rawTextTag = tagName;
      }
    }

    return result;
  }

  function sanitizeTokenForSlides(token: Token): Token | null {
    if (token.type === 'inline') {
      token.content = stripActualHrTags(token.content);
      if (token.children) {
        const sanitizedChildren: Token[] = [];
        for (const child of token.children) {
          const sanitizedChild = sanitizeTokenForSlides(child);
          if (sanitizedChild) {
            sanitizedChildren.push(sanitizedChild);
          }
        }
        token.children = sanitizedChildren;
      }
      return token;
    }

    if (token.type !== 'html_block' && token.type !== 'html_inline') {
      return token;
    }

    const strippedContent = stripActualHrTags(token.content);
    if (strippedContent.trim() === '') {
      return null;
    }

    token.content = strippedContent;
    return token;
  }

  markdown.core.ruler.before('toc_collector', 'slides_transform', state => {
    if (!slides) {
      return;
    }

    if (isInlineOnlyTokenStream(state.tokens)) {
      return;
    }

    const env = (state.env ??= {}) as Record<string, unknown>;
    const slideGroups: Token[][] = [];
    let currentSlide: Token[] = [];

    for (const token of state.tokens) {
      const sanitizedToken = sanitizeTokenForSlides(token);
      if (!sanitizedToken) {
        continue;
      }

      if (sanitizedToken.type === 'hr') {
        if (sanitizedToken.level === 0) {
          if (currentSlide.length > 0) {
            slideGroups.push(currentSlide);
            currentSlide = [];
          }
        }
        continue;
      }

      currentSlide.push(sanitizedToken);
    }

    if (currentSlide.length > 0) {
      slideGroups.push(currentSlide);
    }

    const transformedTokens = [
      createWrapperToken('slide_deck_open', 1, [
        ['class', 'slide-deck'],
        ['data-slides-root', ''],
      ]),
    ];

    for (const [slideIndex, slideTokens] of slideGroups.entries()) {
      transformedTokens.push(
        createWrapperToken('slide_open', 1, [
          ['class', 'slide'],
          ['data-slide-index', String(slideIndex)],
        ]),
      );
      transformedTokens.push(...slideTokens);
      transformedTokens.push(createWrapperToken('slide_close', -1, []));
    }

    transformedTokens.push(createWrapperToken('slide_deck_close', -1, []));

    env.slides = true;
    env.slideCount = slideGroups.length;
    state.tokens = transformedTokens;
  });

  // The @vscode/markdown-it-katex plugin's renderers swallow errors thrown
  // by katex.renderToString() and return error HTML instead of propagating
  // the exception. Override the renderers so parse errors fail the build.
  // The plugin's tokenizer ($ and $$ delimiter parsing) is kept.
  // Each renderer also adds an aria-label with a screen-reader-friendly
  // description generated by katex/contrib/render-a11y-string.
  markdown.renderer.rules.math_inline = (tokens: Token[], idx: number) => {
    const latex = tokens[idx].content;
    const html = katex.renderToString(latex, { throwOnError: true });
    const a11y = markdown.utils.escapeHtml(renderA11yString(latex));
    return html.replace(
      '<span class="katex">',
      `<span class="katex" aria-label="${a11y}">`,
    );
  };
  const katexBlockRenderer = (tokens: Token[], idx: number) => {
    const latex = tokens[idx].content;
    const html = katex.renderToString(latex, {
      throwOnError: true,
      displayMode: true,
    });
    const a11y = markdown.utils.escapeHtml(renderA11yString(latex));
    return `<p class="katex-block" aria-label="${a11y}">` + html + `</p>\n`;
  };
  markdown.renderer.rules.math_block = katexBlockRenderer;
  markdown.renderer.rules.math_inline_block = katexBlockRenderer;
  markdown.renderer.rules.math_inline_bare_block = katexBlockRenderer;

  const usedIds = new Map<string, number>();
  markdown.use(markdownItContainer, 'alert', {
    marker: '!',
    validate: function (params: string) {
      return ALERT_PATTERN.test(params.trim());
    },
    render: function (
      tokens: Token[],
      idx: number,
      _options: unknown,
      env: Record<string, unknown>,
    ) {
      const matches = tokens[idx].info.trim().match(ALERT_PATTERN);

      if (tokens[idx].nesting === 1) {
        const classNames = ['alert'];
        const type = matches && matches[1]?.trim();
        if (type) {
          classNames.push(type);
        }

        const title = matches && (matches[2] || matches[3])?.trim();
        const displayTitle = title
          ? markdown.utils.escapeHtml(curlyQuote(title))
          : capitalize(type || '');
        const baseId = textToId(title || type || '');
        const titleId = deduplicateId(usedIds, baseId);

        if (!env.alertIds) {
          env.alertIds = [];
        }
        (env.alertIds as string[]).push(titleId);

        let html = `<div class="${classNames.join(' ')}">`;
        html += `<p class="title" id="${titleId}">${displayTitle}</p>\n`;
        html += '<div class="content">\n';
        return html;
      } else {
        return '</div></div>\n';
      }
    },
  });

  markdown.use(markdownItContainer, 'question', {
    marker: '?',
    validate: function (params: string) {
      return QUESTION_PATTERN.test(params.trim());
    },
    render: function (tokens: Token[], idx: number) {
      const m = tokens[idx].info.trim().match(QUESTION_PATTERN);
      if (tokens[idx].nesting === 1) {
        const question = markdown.renderInline(m![1]);
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

  markdown.core.ruler.before(
    'slides_transform',
    'multiple_choice_questions',
    state => {
      const transformedTokens: Token[] = [];
      for (let i = 0; i < state.tokens.length; i++) {
        const token = state.tokens[i];
        if (token.type !== 'container_question_open') {
          transformedTokens.push(token);
          continue;
        }

        const closeIndex = findQuestionCloseIndex(state.tokens, i);
        if (closeIndex === -1) {
          transformedTokens.push(token);
          continue;
        }

        const multipleChoice = parseMultipleChoiceQuestion(
          state.tokens,
          i,
          closeIndex,
        );
        if (!multipleChoice) {
          transformedTokens.push(...state.tokens.slice(i, closeIndex + 1));
          i = closeIndex;
          continue;
        }

        const multipleChoiceToken = new Token(
          'question_multiple_choice',
          '',
          0,
        );
        multipleChoiceToken.block = true;
        multipleChoiceToken.level = token.level;
        multipleChoiceToken.map = token.map;
        multipleChoiceToken.meta = multipleChoice;
        transformedTokens.push(multipleChoiceToken);
        i = closeIndex;
      }

      state.tokens = transformedTokens;
    },
  );

  markdown.renderer.rules.question_multiple_choice = (
    tokens,
    idx,
    renderOptions,
    env,
  ) => {
    const meta = tokens[idx].meta as MultipleChoiceMeta;
    const question = markdown.renderInline(meta.question);
    const optionsHtml = meta.options
      .map(option => {
        const correctAttribute = option.correct ? ' data-correct=""' : '';
        const optionHtml = markdown.renderer.render(
          [option.inline],
          renderOptions,
          env,
        );
        return (
          '<div class="question-multiple-choice-option"' +
          correctAttribute +
          '>' +
          optionHtml +
          '</div>'
        );
      })
      .join('');

    return (
      '<div class="question question-multiple-choice">' +
      '<p class="question-q"><span class="question-label">Q.</span><span>' +
      question +
      '</span></p>' +
      '<div class="question-multiple-choice-options">' +
      optionsHtml +
      '</div></div>\n'
    );
  };

  /*
   * Customize markdown-it-footnote renderer.
   *
   * Footnotes are labeled with single characters from Inter's ss06
   * stylistic set: 1-9 for the first nine footnotes, then A-Z. The
   * default <ol> numbering is suppressed via CSS and we inject a
   * marker span per item so the label sequence can mix digits and
   * letters.
   */
  markdown.renderer.rules.footnote_block_open = () =>
    '<div class="footnotes"><p class="title">Footnotes</p><ol>';

  markdown.renderer.rules.footnote_block_close = () => '</ol></div>';

  markdown.renderer.rules.footnote_caption = (tokens: Token[], idx: number) => {
    const id = tokens[idx].meta!.id as number;
    return footnoteLabel(id + 1);
  };

  const footnoteRef = markdown.renderer.rules.footnote_ref!;
  markdown.renderer.rules.footnote_ref = (
    tokens: Token[],
    idx: number,
    options: Options,
    env: unknown,
    self: Renderer,
  ) =>
    // Prepend a non-breaking space so the reference link cannot wrap
    // away from the word it follows.
    '\u00a0' +
    footnoteRef(tokens, idx, options, env, self)
      .replace('<sup class="footnote-ref">', '')
      .replace('</sup>', '')
      .replace('<a href="', '<a class="footnote-ref" href="');

  markdown.renderer.rules.footnote_open = (tokens: Token[], idx: number) => {
    const id = tokens[idx].meta!.id as number;
    const label = footnoteLabel(id + 1);
    const refid = id + 1;
    return (
      `<li id="fn${refid}" class="footnote-item">` +
      `<span class="footnote-marker" aria-hidden="true">${label}</span> `
    );
  };

  markdown.renderer.rules.footnote_close = () => '</li>\n';

  const footnoteAnchor = markdown.renderer.rules.footnote_anchor!;
  markdown.renderer.rules.footnote_anchor = (
    tokens: Token[],
    idx: number,
    options: Options,
    env: unknown,
    self: Renderer,
  ) =>
    footnoteAnchor(tokens, idx, options, env, self).replace(
      '\u21a9\uFE0E',
      '\u2191',
    );

  /*
   * Customize lists (add wrapper element)
   */
  const proxy = (
    tokens: Token[],
    idx: number,
    options: Options,
    _env: unknown,
    self: Renderer,
  ) => self.renderToken(tokens, idx, options);

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

  // Convert <!--- comments containing fences into hidden_fence tokens
  markdown.core.ruler.push('hidden_fence', state => {
    for (let i = state.tokens.length - 1; i >= 0; i--) {
      const token = state.tokens[i];
      if (token.type !== 'html_block') {
        continue;
      }

      const src = token.content.trim();
      if (!src.startsWith('<!---') || !src.endsWith('-->')) {
        continue;
      }

      const inner = src.slice(5, -3).trim();
      const fenceMatch = inner.match(/^```\w*\n?([\s\S]*?)```$/m);
      if (!fenceMatch) {
        continue;
      }

      token.type = 'hidden_fence';
      token.tag = 'code';
      token.content = fenceMatch[1];
    }
  });

  markdown.renderer.rules.hidden_fence = () => '';

  markdown.renderer.rules.slide_deck_open = () =>
    '<div class="slide-deck" data-slides-root>';
  markdown.renderer.rules.slide_deck_close = () => '</div>';
  markdown.renderer.rules.slide_open = (tokens, idx) =>
    `<div class="slide" data-slide-index="${tokens[idx].attrGet('data-slide-index') ?? ''}">`;
  markdown.renderer.rules.slide_close = () => '</div>';

  markdown.renderer.rules.fence = (tokens, idx) => {
    const token = tokens[idx];
    const lang = token.info.trim().split(/\s+/)[0] || 'text';
    const code = token.content;
    let useLang: string;

    if (isPlainTextLanguage(lang)) {
      useLang = 'text';
    } else if (isBundledLanguage(lang)) {
      if (!(siteVariables.shikiLanguages ?? []).includes(lang)) {
        throw new Error(
          `${filePath ?? 'Markdown'}: Markdown fence language "${lang}" is not listed in site.shikiLanguages`,
        );
      }
      useLang = lang;
    } else {
      throw new Error(
        `${filePath ?? 'Markdown'}: Markdown fence language "${lang}" is not a supported Shiki language`,
      );
    }

    return highlightCode(code, useLang);
  };

  return markdown;
}
