const HIDDEN_CODE_PATTERN = /^```\w*\n?([\s\S]*?)```$/m;

export function stripHtmlComments(str: string): string {
  return str.replace(/<!---[\s\S]*?-->/g, '');
}

/**
 * The code in a hidden code block, a `<!---` comment that holds a fenced code
 * block. Literate Java pages compile hidden code without showing it.
 */
export function hiddenCodeBlock(comment: string): string | undefined {
  const src = comment.trim();
  if (!src.startsWith('<!---') || !src.endsWith('-->')) {
    return undefined;
  }
  return src.slice(5, -3).trim().match(HIDDEN_CODE_PATTERN)?.[1];
}

/**
 * Applies `replace` to the text outside `<!--- -->` comments and to hidden
 * code blocks, keeping every comment in place
 */
export function replaceOutsideHtmlComments(
  str: string,
  replace: (text: string) => string,
): string {
  return str
    .split(/(<!---[\s\S]*?-->)/)
    .map((part, i) =>
      i % 2 === 0 || hiddenCodeBlock(part) !== undefined ? replace(part) : part,
    )
    .join('');
}
