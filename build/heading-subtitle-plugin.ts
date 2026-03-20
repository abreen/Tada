import type MarkdownIt from 'markdown-it';

export default function specialHeadingsPlugin(md: MarkdownIt): void {
  md.core.ruler.push('special_headings', state => {
    const tokens = state.tokens;
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i].type !== 'heading_open') {
        continue;
      }

      // Expected structure: heading_open -> inline -> heading_close
      const inline = tokens[i + 1];
      const close = tokens[i + 2];
      if (
        !inline ||
        inline.type !== 'inline' ||
        !close ||
        close.type !== 'heading_close'
      ) {
        continue;
      }

      const original = inline.content;
      // Match: <main> # <subtitle>
      const parts = original.split(/ # /);
      if (parts.length < 2) {
        continue;
      }

      const main = parts.shift();
      const subtitle = parts.join(' # ').trim();
      if (!main || !subtitle) {
        continue;
      }

      // Find the delimiter " # " inside child text tokens to wrap the remainder
      if (Array.isArray(inline.children)) {
        for (let ci = 0; ci < inline.children.length; ci++) {
          const child = inline.children[ci];
          if (child.type !== 'text') {
            continue;
          }
          const sepIndex = child.content.indexOf(' # ');
          if (sepIndex === -1) {
            continue;
          }

          // Split the text token around the first " # "
          const before = child.content.slice(0, sepIndex).trimEnd();
          const afterPart = child.content.slice(sepIndex + 3); // skip " # "
          child.content = before + ' '; // ensure a single space before subtitle

          // Collect subtitle tokens: (afterPart as text, plus all following siblings)
          const subtitleTokens = [];
          if (afterPart) {
            const t = new state.Token('text', '', 0);
            t.content = afterPart;
            subtitleTokens.push(t);
          }
          for (let k = ci + 1; k < inline.children.length; k++) {
            subtitleTokens.push(inline.children[k]);
          }

          // Truncate children after the (modified) delimiter text token
          inline.children.length = ci + 1;

          // Inject span wrapper with preserved formatting tokens
          const openSpan = new state.Token('html_inline', '', 0);
          openSpan.content = '<span class="heading-subtitle">';
          const closeSpan = new state.Token('html_inline', '', 0);
          closeSpan.content = '</span>';
          inline.children.push(openSpan, ...subtitleTokens, closeSpan);
          break;
        }
      }

      // Update inline.content (plain text representation)
      inline.content = `${main} ${subtitle}`;
      tokens[i].attrJoin('class', 'has-subtitle');
    }
  });
}
