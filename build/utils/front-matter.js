const fm = require('front-matter');
const { extensionIsMarkdown } = require('./file-types');

function parseFrontMatterAndContent(raw, ext) {
  const { frontMatter, content } = parseFrontMatter(raw, ext);

  // Add delimiters to satisfy the front-matter library
  const result = fm(`---\n${frontMatter}\n---\n`);

  return { pageVariables: result.attributes, content };
}

function parseFrontMatterPlainText(rawContent) {
  const lines = rawContent.split(/\r?\n/);
  const fmLines = [];
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

function parseFrontMatter(rawContent, ext) {
  if (extensionIsMarkdown(ext) || ext === '.html') {
    return parseFrontMatterPlainText(rawContent);
  } else {
    // unknown type, return raw
    return { frontMatter: null, content: rawContent };
  }
}

module.exports = { parseFrontMatter, parseFrontMatterAndContent };
