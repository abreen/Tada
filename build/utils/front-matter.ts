import fm from 'front-matter';
import { extensionIsMarkdown } from './file-types';
import type { ParsedContent } from '../types';

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

function parseFrontMatterStandard(rawContent: string): RawParsedFrontMatter {
  const lines = rawContent.split(/\r?\n/);

  // Caller has already verified lines[0] === '---'
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === '---') {
      return {
        frontMatter: lines.slice(1, i).join('\n'),
        content: lines.slice(i + 1).join('\n'),
      };
    }
  }

  throw new Error(
    'Front matter starts with --- but no closing --- delimiter was found',
  );
}

export function parseFrontMatter(
  rawContent: string,
  ext: string,
): RawParsedFrontMatter {
  if (extensionIsMarkdown(ext) || ext === '.html') {
    // Detect standard YAML front matter (first line is exactly ---)
    const firstNewline = rawContent.indexOf('\n');
    const firstLine =
      firstNewline === -1 ? rawContent : rawContent.slice(0, firstNewline);
    const firstLineTrimmedCR = firstLine.endsWith('\r')
      ? firstLine.slice(0, -1)
      : firstLine;

    if (firstLineTrimmedCR === '---') {
      return parseFrontMatterStandard(rawContent);
    }

    return parseFrontMatterPlainText(rawContent);
  } else {
    // unknown type, return raw
    return { frontMatter: null, content: rawContent };
  }
}
