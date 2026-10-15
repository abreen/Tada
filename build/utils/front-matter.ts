import fm from 'front-matter';
import { extensionIsMarkdown } from './file-types';
import { parseYamlWithVariables } from '../variables';
import type { ParsedContent } from '../types';

interface RawParsedFrontMatter {
  frontMatter: string | null;
  content: string;
}

/**
 * Splits a page into front matter fields and content. Every reader of page
 * front matter uses this, so they all agree on its fields and its errors.
 */
export function parseFrontMatterAndContent(
  raw: string,
  ext: string,
  displayPath = 'front matter',
): ParsedContent {
  const { frontMatter, content } = parseFrontMatter(raw, ext);
  const pageVariables = parseYamlWithVariables(
    frontMatter ?? '',
    displayPath,
    parseFrontMatterYaml,
  ) as Record<string, unknown>;
  return { pageVariables, content };
}

export function parseFrontMatterYaml(text: string): Record<string, unknown> {
  // Add delimiters to satisfy the front-matter library
  return fm(`---\n${text}\n---\n`).attributes as Record<string, unknown>;
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
    if (lines[i].trimEnd() === '---') {
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
    // Detect standard YAML front matter (first line is exactly ---,
    // ignoring trailing whitespace and \r)
    const firstNewline = rawContent.indexOf('\n');
    const firstLine =
      firstNewline === -1 ? rawContent : rawContent.slice(0, firstNewline);

    if (firstLine.trimEnd() === '---') {
      return parseFrontMatterStandard(rawContent);
    }

    return parseFrontMatterPlainText(rawContent);
  } else {
    // unknown type, return raw
    return { frontMatter: null, content: rawContent };
  }
}
