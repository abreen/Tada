import type { JavaTocEntry } from './types';

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
  id?: string;
}

type TocItem = HeadingItem | DinkusItem | AlertItem;

export function generateTocHtml(
  tocItems: TocItem[],
  alertIds: string[],
): string {
  if (!tocItems || tocItems.length === 0) {
    return '';
  }

  let lastHeadingLevel = 1;
  let alertIdx = 0;
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
      const id = alertIds[alertIdx++];
      const href = `#${id}`;
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
