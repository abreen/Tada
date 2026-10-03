import { decodeHTML } from 'entities';

/**
 * Converts rendered inline HTML (such as a front matter title rendered as
 * Markdown) into the plain text a reader sees: tags and comments are removed
 * by an HTML parser, and character references are decoded exactly once.
 */
export function htmlToPlainText(html: string): string {
  let text = '';
  new HTMLRewriter()
    .onDocument({
      text(chunk) {
        text += chunk.text;
      },
    })
    .transform(html);
  return decodeHTML(text);
}
