import MarkdownIt from 'markdown-it';
import type { SiteVariables } from '../types';

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
  _siteVariables: SiteVariables,
  _options: Record<string, unknown> = {},
): MarkdownIt {
  return new MarkdownIt({ html: true, typographer: true });
}
