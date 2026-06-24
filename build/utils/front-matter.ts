import fm from 'front-matter';
import { extensionIsPlainTextPage } from './file-types';
import type { ParsedContent } from '../types';

interface RawParsedFrontMatter {
  frontMatter: string | null;
  content: string;
}

interface ParsedFrontMatterDocument extends RawParsedFrontMatter {
  attributes: Record<string, unknown>;
}

export function parseFrontMatterAndContent(
  raw: string,
  ext: string,
): ParsedContent {
  const { attributes, content } = parseFrontMatterDocument(raw, ext);

  return { pageVariables: attributes, content };
}

function parseFrontMatterDocument(
  rawContent: string,
  ext: string,
): ParsedFrontMatterDocument {
  if (!extensionIsPlainTextPage(ext)) {
    return { frontMatter: null, content: rawContent, attributes: {} };
  }

  const firstNewline = rawContent.indexOf('\n');
  const firstLine =
    firstNewline === -1 ? rawContent : rawContent.slice(0, firstNewline);
  if (firstLine.trimEnd() !== '---') {
    throw new Error('Front matter must start with ---');
  }

  const normalized = `---${rawContent.slice(firstLine.length)}`;
  const closingDelimiter = normalized
    .split(/\r?\n/)
    .slice(1)
    .find(line => /^(?:---|\.\.\.)\s*$/.test(line));
  if (!closingDelimiter || !/^---\s*$/.test(closingDelimiter)) {
    throw new Error(
      'Front matter starts with --- but no closing --- delimiter was found',
    );
  }

  const result = fm(normalized);
  return {
    frontMatter: result.frontmatter || '',
    content: result.body,
    attributes: result.attributes as Record<string, unknown>,
  };
}

export function parseFrontMatter(
  rawContent: string,
  ext: string,
): RawParsedFrontMatter {
  const { frontMatter, content } = parseFrontMatterDocument(rawContent, ext);
  return { frontMatter, content };
}
