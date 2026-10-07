import type MarkdownIt from 'markdown-it';
import { convertMarkdown as curlyQuote } from 'quote-quote';
import type { JavaTocEntry } from './types';
import textToId, { deduplicateId } from './text-to-id';

interface HeadingItem {
  kind: 'heading';
  level: string;
  id: string;
  innerHtml: string;
}

interface DinkusItem {
  kind: 'dinkus';
}

interface AlertItem {
  kind: 'alert';
  type: string;
  title: string;
  id: string;
}

type TocItem = HeadingItem | DinkusItem | AlertItem;

// Net <details> elements an HTML block opens. Markdown between a raw <details>
// and its </details> is parsed as separate tokens, so track the nesting here.
function detailsDepthChange(html: string): number {
  const opened = html.match(/<details[\s>]/gi)?.length ?? 0;
  const closed = html.match(/<\/details\s*>/gi)?.length ?? 0;
  return opened - closed;
}

export function tocPlugin(md: MarkdownIt): void {
  md.core.ruler.push('toc_collector', state => {
    if (!state.env) {
      return;
    }

    const tokens = state.tokens;
    const items: TocItem[] = [];
    let containerDepth = 0;
    let detailsDepth = 0;
    const usedAlertIds = new Map<string, number>();

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];

      // Nothing inside a <details> is listed
      if (token.type === 'html_block') {
        detailsDepth = Math.max(
          0,
          detailsDepth + detailsDepthChange(token.content),
        );
        continue;
      }

      // Headings (included at any container depth, but not inside a <details>)
      if (token.type === 'heading_open') {
        if (detailsDepth > 0) {
          continue;
        }
        const inline = tokens[i + 1];
        if (!inline || inline.type !== 'inline') {
          continue;
        }

        const level = token.tag[1]; // 'h2' -> '2'
        const id = token.attrGet('id') || '';
        const innerHtml = md.renderer.renderInline(
          inline.children ?? [],
          md.options,
          state.env,
        );

        items.push({ kind: 'heading', level, id, innerHtml });
        continue;
      }

      // Thematic breaks / dinkuses (not inside an alert, question, or <details>)
      if (
        token.type === 'hr' &&
        containerDepth === 0 &&
        detailsDepth === 0 &&
        !state.env?.slides
      ) {
        items.push({ kind: 'dinkus' });
        continue;
      }

      // Alerts (not inside another alert, question, or <details>)
      // Must be checked before generic container tracking below
      if (token.type === 'container_alert_open') {
        const match = token.info
          .trim()
          .match(/^(note|warning)(?:\s+"(.+)"|\s+(.+))?$/);
        if (match) {
          const type = match[1];
          const title = (match[2] || match[3])?.trim();
          // Assign IDs to every alert, including those excluded from the TOC.
          const id = deduplicateId(usedAlertIds, textToId(title || type));
          token.attrSet('id', id);
          if (containerDepth === 0 && detailsDepth === 0) {
            const displayTitle = title
              ? md.utils.escapeHtml(curlyQuote(title))
              : type === 'warning'
                ? 'Warning'
                : 'Note';
            items.push({ kind: 'alert', type, title: displayTitle, id });
          }
        }
        // Fall through to count the alert as a container
      }

      // Track container nesting
      if (token.type.startsWith('container_') && token.type.endsWith('_open')) {
        containerDepth++;
        continue;
      }
      if (
        token.type.startsWith('container_') &&
        token.type.endsWith('_close')
      ) {
        containerDepth--;
        continue;
      }
    }

    state.env.tocItems = items;
  });
}

export function generateTocHtml(tocItems: TocItem[]): string {
  if (!tocItems || tocItems.length === 0) {
    return '';
  }

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
      const href = `#${item.id}`;
      parts.push(
        `<li class="alert-item level${level} ${item.type}">` +
          `<a href="${href}">${item.title}</a></li>`,
      );
    }
  }

  parts.push('</ol>');
  return parts.join('');
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const GROUP_LABELS: Record<string, string> = {
  field: 'Fields',
  constructor: 'Constructors',
  method: 'Methods',
};

export function generateCodeTocHtml(codeTocItems: JavaTocEntry[]): string {
  if (!codeTocItems || codeTocItems.length === 0) {
    return '';
  }

  const groups: Record<string, JavaTocEntry[]> = Object.create(null);
  const kindOrder: string[] = [];
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
    if (label) {
      parts.push(`<li class="label">${label}</li>`);
    }
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
