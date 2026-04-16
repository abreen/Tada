interface RawHtmlAttributeMatch {
  tagName: string;
  attrName: string;
  value: string;
  valueStart: number;
  valueEnd: number;
  quote: '"' | "'" | null;
}

function isWhitespace(char: string): boolean {
  return /\s/.test(char);
}

function isNameChar(char: string): boolean {
  return /[A-Za-z0-9:_-]/.test(char);
}

function skipQuotedValue(
  html: string,
  index: number,
  quote: '"' | "'",
  end: number,
): number {
  let i = index + 1;
  while (i < end && html[i] !== quote) {
    i += 1;
  }
  return i < end ? i + 1 : end;
}

function findTagEnd(html: string, start: number): number {
  let i = start;
  let quote: '"' | "'" | null = null;

  while (i < html.length) {
    const char = html[i];
    if (quote) {
      if (char === quote) {
        quote = null;
      }
      i += 1;
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      i += 1;
      continue;
    }

    if (char === '>') {
      return i;
    }

    i += 1;
  }

  return -1;
}

export function findRawHtmlAttributes(
  html: string,
  tagNames: string[],
  attrNames: string[],
): RawHtmlAttributeMatch[] {
  const matches: RawHtmlAttributeMatch[] = [];
  const tagNameSet = new Set(tagNames.map(name => name.toLowerCase()));
  const attrNameSet = new Set(attrNames.map(name => name.toLowerCase()));

  let i = 0;
  while (i < html.length) {
    if (html[i] !== '<') {
      i += 1;
      continue;
    }

    if (html.startsWith('<!--', i)) {
      const commentEnd = html.indexOf('-->', i + 4);
      i = commentEnd === -1 ? html.length : commentEnd + 3;
      continue;
    }

    const next = html[i + 1];
    if (!next || next === '/' || next === '!' || next === '?') {
      i += 1;
      continue;
    }

    let tagNameEnd = i + 1;
    while (tagNameEnd < html.length && isNameChar(html[tagNameEnd])) {
      tagNameEnd += 1;
    }

    const tagEnd = findTagEnd(html, tagNameEnd);
    if (tagEnd === -1) {
      break;
    }

    const tagName = html.slice(i + 1, tagNameEnd).toLowerCase();
    if (!tagNameSet.has(tagName)) {
      i = tagEnd + 1;
      continue;
    }

    let attrIndex = tagNameEnd;
    while (attrIndex < tagEnd) {
      while (attrIndex < tagEnd && isWhitespace(html[attrIndex])) {
        attrIndex += 1;
      }

      if (attrIndex >= tagEnd || html[attrIndex] === '/') {
        attrIndex += 1;
        continue;
      }

      const attrNameStart = attrIndex;
      while (attrIndex < tagEnd && isNameChar(html[attrIndex])) {
        attrIndex += 1;
      }

      if (attrNameStart === attrIndex) {
        attrIndex += 1;
        continue;
      }

      const attrName = html.slice(attrNameStart, attrIndex).toLowerCase();

      while (attrIndex < tagEnd && isWhitespace(html[attrIndex])) {
        attrIndex += 1;
      }

      if (attrIndex >= tagEnd || html[attrIndex] !== '=') {
        continue;
      }

      attrIndex += 1;
      while (attrIndex < tagEnd && isWhitespace(html[attrIndex])) {
        attrIndex += 1;
      }

      if (attrIndex >= tagEnd) {
        break;
      }

      const valueStart = attrIndex;
      let valueEnd = attrIndex;
      let quote: '"' | "'" | null = null;

      if (html[attrIndex] === '"' || html[attrIndex] === "'") {
        quote = html[attrIndex] as '"' | "'";
        const quotedValueStart = attrIndex + 1;
        const quotedValueEnd =
          skipQuotedValue(html, attrIndex, quote, tagEnd) - 1;
        attrIndex = quotedValueEnd + 1;

        if (attrNameSet.has(attrName)) {
          matches.push({
            tagName,
            attrName,
            value: html.slice(quotedValueStart, quotedValueEnd),
            valueStart: quotedValueStart,
            valueEnd: quotedValueEnd,
            quote,
          });
        }
        continue;
      }

      while (
        valueEnd < tagEnd &&
        !isWhitespace(html[valueEnd]) &&
        html[valueEnd] !== '>'
      ) {
        valueEnd += 1;
      }

      attrIndex = valueEnd;

      if (attrNameSet.has(attrName)) {
        matches.push({
          tagName,
          attrName,
          value: html.slice(valueStart, valueEnd),
          valueStart,
          valueEnd,
          quote,
        });
      }
    }

    i = tagEnd + 1;
  }

  return matches;
}
