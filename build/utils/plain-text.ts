import { decodeHTML } from 'entities';

// An HTML comment, or an open/close tag whose attribute values may be quoted
// and contain `>`. Markdown-it escapes every other `<` in rendered text as
// `&lt;`, so any `<` left in its output starts one of these.
const HTML_TAG_RE =
  /<!--[\s\S]*?-->|<\/?[A-Za-z][A-Za-z0-9-]*(?:\s+[^\s"'>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*\s*\/?>/g;

/**
 * Converts rendered inline HTML (such as a front matter title rendered as
 * Markdown) into the plain text a reader sees: tags are removed and
 * character references are decoded exactly once.
 */
export function htmlToPlainText(html: string): string {
  return decodeHTML(html.replace(HTML_TAG_RE, ''));
}
