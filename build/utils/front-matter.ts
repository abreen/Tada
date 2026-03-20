import fm from 'front-matter';
import { extensionIsMarkdown } from './file-types.js';
import type { ParsedContent } from '../types.js';

interface RawParsedFrontMatter {
  frontMatter: string | null;
  content: string;
}

export function parseFrontMatterAndContent(
  raw: string,
  ext: string,
): ParsedContent {
  const { frontMatter, content } = parseFrontMatter(raw, ext);

  // Add delimiters to satisfy the front-matter library
  const result = fm(`---\n${frontMatter}\n---\n`);

  return {
    pageVariables: result.attributes as Record<string, unknown>,
    content,
  };
}

function parseFrontMatterPlainText(rawContent: string): RawParsedFrontMatter {
  const lines = rawContent.split(/\r?\n/);
  const fmLines: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) {
      break;
    } // stop at first completely blank line

    fmLines.push(line);

    // Handle YAML multi-line | syntax
    if (line.match(/:\s*\|$/)) {
      i++;
      while (i < lines.length && /^\s+/.test(lines[i])) {
        fmLines.push(lines[i++]);
      }
      continue;
    }

    i++;
  }

  if (fmLines.length === 0) {
    return { frontMatter: null, content: rawContent };
  }
  return {
    frontMatter: fmLines.join('\n'),
    content: lines.slice(i).join('\n'),
  };
}

export function parseFrontMatter(
  rawContent: string,
  ext: string,
): RawParsedFrontMatter {
  if (extensionIsMarkdown(ext) || ext === '.html') {
    return parseFrontMatterPlainText(rawContent);
  } else {
    // unknown type, return raw
    return { frontMatter: null, content: rawContent };
  }
}
