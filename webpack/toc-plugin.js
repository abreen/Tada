const { convertMarkdown: curlyQuote } = require('quote-quote');

function tocPlugin(md) {
  md.core.ruler.push('toc_collector', state => {
    if (!state.env) return;

    const tokens = state.tokens;
    const items = [];
    const containerStack = [];

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];

      // Headings (included at any nesting level)
      if (token.type === 'heading_open') {
        const inline = tokens[i + 1];
        if (!inline || inline.type !== 'inline') continue;

        const level = token.tag[1]; // 'h2' -> '2'
        const id = token.attrGet('id') || '';
        const innerHtml = md.renderer.renderInline(
          inline.children,
          md.options,
          state.env,
        );

        items.push({ kind: 'heading', level, id, innerHtml });
        continue;
      }

      // Thematic breaks / dinkuses (only at top level)
      if (token.type === 'hr' && containerStack.length === 0) {
        items.push({ kind: 'dinkus' });
        continue;
      }

      // Alerts (only at top level or directly inside a section)
      // Must be checked before generic container tracking below
      if (token.type === 'container_alert_open') {
        const depth = containerStack.length;
        const parentIsSection = depth === 1 && containerStack[0] === 'section';

        if (depth === 0 || parentIsSection) {
          const match = token.info.trim().match(/^(note|warning)\s*"?(.+)?"?$/);
          if (match) {
            const type = match[1];
            let title = match[2]?.trim();
            if (title) {
              title = md.utils.escapeHtml(curlyQuote(title));
            } else {
              title = type === 'warning' ? 'Warning' : 'Note';
            }
            items.push({ kind: 'alert', type, title });
          }
        }
        // Fall through to push 'alert' onto container stack
      }

      // Track container nesting
      if (token.type.startsWith('container_') && token.type.endsWith('_open')) {
        const containerType = token.type.slice(
          'container_'.length,
          -'_open'.length,
        );
        containerStack.push(containerType);
        continue;
      }
      if (
        token.type.startsWith('container_') &&
        token.type.endsWith('_close')
      ) {
        containerStack.pop();
        continue;
      }
    }

    state.env.tocItems = items;
  });
}

function generateTocHtml(tocItems) {
  if (!tocItems || tocItems.length === 0) return '';

  let lastHeadingLevel = 1;
  const parts = ['<ol>'];

  for (const item of tocItems) {
    if (item.kind === 'dinkus') {
      parts.push('<li class="dinkus-item"></li>');
      continue;
    }

    if (item.kind === 'heading') {
      parts.push(
        `<li class="heading-item level${item.level}">` +
          `<a href="#${item.id}">${item.innerHtml}</a></li>`,
      );
      lastHeadingLevel = parseInt(item.level);
      continue;
    }

    if (item.kind === 'alert') {
      const level = lastHeadingLevel + 1;
      parts.push(
        `<li class="alert-item level${level} ${item.type}">` +
          `<a href="#">${item.title}</a></li>`,
      );
    }
  }

  parts.push('</ol>');
  return parts.join('');
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const GROUP_LABELS = {
  field: 'Fields',
  constructor: 'Constructors',
  method: 'Methods',
};

function generateCodeTocHtml(codeTocItems) {
  if (!codeTocItems || codeTocItems.length === 0) return '';

  const groups = Object.create(null);
  const kindOrder = [];
  for (const item of codeTocItems) {
    if (!groups[item.kind]) {
      groups[item.kind] = [];
      kindOrder.push(item.kind);
    }
    groups[item.kind].push(item);
  }

  const parts = ['<ol>'];
  for (const kind of kindOrder) {
    const label = GROUP_LABELS[kind];
    if (label) parts.push(`<li class="label">${label}</li>`);
    for (const item of groups[kind]) {
      parts.push(
        `<li class="heading-item level2">` +
          `<a href="#L${item.line}">${escapeHtml(item.name)}</a></li>`,
      );
    }
  }
  parts.push('</ol>');
  return parts.join('');
}

module.exports = { tocPlugin, generateTocHtml, generateCodeTocHtml };
