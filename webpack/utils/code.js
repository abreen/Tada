const MarkdownIt = require('markdown-it');
const { parse: parseJava } = require('java-parser');
const { JSDOM } = require('jsdom');
const { makeLogger } = require('../log');
const { getHighlighter } = require('./shiki-highlighter');

const log = makeLogger(__filename, 'debug');

const PROSE_LINE = /^\s*\/\/\/(\s|$)/;

function createCodeMarkdown(siteVariables, options = {}) {
  return new MarkdownIt({ html: true, typographer: true })
    .use(require('../external-links-plugin'), siteVariables)
    .use(require('../apply-base-path-plugin'), siteVariables, options);
}

const JAVA_TYPE_DECLARATION_NODES = new Set([
  'classDeclaration',
  'interfaceDeclaration',
  'enumDeclaration',
  'recordDeclaration',
]);

function extractJavaMethodMeta(methodNode, requireBody = true) {
  const methodBody = methodNode.children?.methodBody?.[0];
  const hasBody = Boolean(methodBody?.children?.block?.length);
  if (requireBody && !hasBody) {
    return null;
  }

  const methodHeader = methodNode.children?.methodHeader?.[0];
  const methodDeclarator = methodHeader?.children?.methodDeclarator?.[0];
  const identifier = methodDeclarator?.children?.Identifier?.[0];
  if (!identifier?.image || !identifier.startLine) {
    return null;
  }

  return {
    baseName: identifier.image,
    line: identifier.startLine,
    params: extractParameterNames(
      methodDeclarator?.children?.formalParameterList?.[0],
    ),
  };
}

function extractJavaConstructorMeta(constructorNode) {
  const constructorDeclarator =
    constructorNode.children?.constructorDeclarator?.[0];
  const identifier =
    constructorDeclarator?.children?.simpleTypeName?.[0]?.children
      ?.typeIdentifier?.[0]?.children?.Identifier?.[0];
  if (!identifier?.image || !identifier.startLine) {
    return null;
  }

  return {
    baseName: identifier.image,
    line: identifier.startLine,
    params: extractParameterNames(
      constructorDeclarator?.children?.formalParameterList?.[0],
    ),
  };
}

function extractParameterNames(formalParameterListNode) {
  if (!formalParameterListNode) {
    return [];
  }

  const formalParameters =
    formalParameterListNode.children?.formalParameter || [];
  return formalParameters
    .map(parameterNode => {
      const regularParameter =
        parameterNode.children?.variableParaRegularParameter?.[0];
      if (regularParameter) {
        const declaratorId =
          regularParameter.children?.variableDeclaratorId?.[0];
        const identifier = declaratorId?.children?.Identifier?.[0];
        const underscore = declaratorId?.children?.Underscore?.[0];
        return identifier?.image || underscore?.image || null;
      }

      const varArgParameter =
        parameterNode.children?.variableArityParameter?.[0];
      return varArgParameter?.children?.Identifier?.[0]?.image || null;
    })
    .filter(Boolean);
}

function formatCallableName(baseName, parameterNames) {
  return `${baseName}(${parameterNames.join(', ')})`;
}

function collectTokensInOrder(node) {
  const tokens = [];
  function collect(n) {
    if (!n) return;
    if (n.image !== undefined) {
      tokens.push(n);
      return;
    }
    const children = n.children || {};
    for (const childArray of Object.values(children)) {
      for (const child of childArray) {
        if (child) collect(child);
      }
    }
  }
  collect(node);
  tokens.sort((a, b) => a.startOffset - b.startOffset);
  return tokens;
}

function buildTypeString(unannTypeNode) {
  return collectTokensInOrder(unannTypeNode)
    .map(t => (t.image === ',' ? ', ' : t.image))
    .join('');
}

function extractJavaFieldMetas(fieldNode) {
  const unannType = fieldNode.children?.unannType?.[0];
  if (!unannType) return [];
  const typeStr = buildTypeString(unannType);

  const variableDeclaratorList =
    fieldNode.children?.variableDeclaratorList?.[0];
  if (!variableDeclaratorList) return [];

  const results = [];
  for (const declarator of variableDeclaratorList.children
    ?.variableDeclarator || []) {
    const declaratorId = declarator.children?.variableDeclaratorId?.[0];
    const identifier = declaratorId?.children?.Identifier?.[0];
    if (!identifier?.image || !identifier.startLine) continue;

    const dimsNode = declaratorId.children?.dims?.[0];
    const dimsStr = dimsNode
      ? collectTokensInOrder(dimsNode)
          .map(t => t.image)
          .join('')
      : '';

    results.push({
      name: `${typeStr}${dimsStr} ${identifier.image}`,
      line: identifier.startLine,
    });
  }
  return results;
}

function extractJavaMethodToc(sourceCode) {
  let cst;
  try {
    cst = parseJava(sourceCode);
  } catch (err) {
    log.error`Failed to parse Java source for TOC: ${err.message}`;
    return [];
  }

  const callables = [];

  function visit(node, typeDepth) {
    if (!node || !node.name) {
      return;
    }

    if (node.name === 'methodDeclaration' && typeDepth <= 1) {
      const method = extractJavaMethodMeta(node);
      if (method) {
        callables.push(method);
      }
    } else if (node.name === 'interfaceMethodDeclaration' && typeDepth <= 1) {
      const method = extractJavaMethodMeta(node, false);
      if (method) {
        callables.push(method);
      }
    } else if (node.name === 'constructorDeclaration' && typeDepth === 1) {
      const constructor = extractJavaConstructorMeta(node);
      if (constructor) {
        callables.push(constructor);
      }
    } else if (
      (node.name === 'fieldDeclaration' ||
        node.name === 'constantDeclaration') &&
      typeDepth <= 1
    ) {
      for (const field of extractJavaFieldMetas(node)) {
        callables.push(field);
      }
    }

    const nextTypeDepth = JAVA_TYPE_DECLARATION_NODES.has(node.name)
      ? typeDepth + 1
      : typeDepth;
    const children = node.children || {};
    for (const value of Object.values(children)) {
      for (const child of value) {
        if (child && child.name) {
          visit(child, nextTypeDepth);
        }
      }
    }
  }

  visit(cst, 0);

  return callables.map(callable => {
    if (callable.name !== undefined) return callable;
    return {
      name: formatCallableName(callable.baseName, callable.params),
      line: callable.line,
    };
  });
}

function escapeAttr(str) {
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function createCodeLine(document) {
  const line = document.createElement('span');
  line.className = 'code-line';
  return line;
}

function cloneOpenElements(openElements, line) {
  const containers = [line];

  for (const openElement of openElements) {
    const clone = openElement.cloneNode(false);
    containers[containers.length - 1].appendChild(clone);
    containers.push(clone);
  }

  return containers;
}

function splitHighlightedHtmlIntoLines(highlightedHtml, lineCount) {
  const fragment = JSDOM.fragment(`<code>${highlightedHtml}</code>`);
  const codeEl = fragment.firstChild;
  const document = codeEl.ownerDocument;
  const lines = [];
  const openElements = [];
  let currentLine = createCodeLine(document);
  let currentContainers = [currentLine];
  let currentLineHasContent = false;

  function finishCurrentLine() {
    if (!currentLineHasContent) {
      currentContainers[currentContainers.length - 1].appendChild(
        document.createTextNode('\u00A0'),
      );
    }
    lines.push(currentLine);
    currentLine = createCodeLine(document);
    currentContainers = cloneOpenElements(openElements, currentLine);
    currentLineHasContent = false;
  }

  function visit(node) {
    if (node.nodeType === 3) {
      const parts = (node.textContent || '').split('\n');
      for (let i = 0; i < parts.length; i++) {
        if (parts[i].length > 0) {
          currentContainers[currentContainers.length - 1].appendChild(
            document.createTextNode(parts[i]),
          );
          currentLineHasContent = true;
        }
        if (i < parts.length - 1) {
          finishCurrentLine();
        }
      }
      return;
    }

    if (node.nodeType !== 1) {
      return;
    }

    const clone = node.cloneNode(false);
    currentContainers[currentContainers.length - 1].appendChild(clone);
    openElements.push(node);
    currentContainers.push(clone);

    for (const child of Array.from(node.childNodes)) {
      visit(child);
    }

    currentContainers.pop();
    openElements.pop();
  }

  for (const child of Array.from(codeEl.childNodes)) {
    visit(child);
  }

  if (currentLineHasContent || lines.length < lineCount) {
    if (!currentLineHasContent) {
      currentContainers[currentContainers.length - 1].appendChild(
        document.createTextNode('\u00A0'),
      );
    }
    lines.push(currentLine);
  }

  while (lines.length < lineCount) {
    lines.push(createCodeLine(document));
  }

  return lines.map(line => line.innerHTML);
}

function renderCodeSegment(lines, startLine, lang) {
  const source = lines.join('\n');
  let lineHtml;

  try {
    const highlighter = getHighlighter();
    const html = highlighter.codeToHtml(source, {
      lang,
      themes: { light: 'github-light', dark: 'github-dark' },
      defaultColor: false,
    });
    const fragment = JSDOM.fragment(html);
    const inner = fragment.querySelector('code').innerHTML;
    lineHtml = splitHighlightedHtmlIntoLines(inner, lines.length);
  } catch (err) {
    log.error`Failed to highlight code block: ${err.message}`;
  }

  if (!lineHtml) {
    lineHtml = lines.map(line => escapeHtml(line));
  }

  const rows = lineHtml.map((line, i) => {
    const lineNumber = startLine + i;
    return `<span class="code-row"><a class="line-number" data-pagefind-ignore id="L${lineNumber}" href="#L${lineNumber}">${lineNumber}</a><code class="shiki language-${lang}">${line}</code></span>`;
  });

  return `<pre>${rows.join('')}</pre>`;
}

function renderCodeWithComments(sourceCode, lang, siteVariables) {
  const md = createCodeMarkdown(siteVariables);
  const lines = sourceCode.split('\n');
  if (lines[lines.length - 1] === '') {
    lines.pop();
  }

  // Group lines into segments
  const segments = [];
  let currentType = null;
  let currentLines = [];
  let currentStart = 1;

  for (let i = 0; i < lines.length; i++) {
    const type =
      lang === 'java' && PROSE_LINE.test(lines[i]) ? 'prose' : 'code';
    if (type !== currentType) {
      if (currentLines.length > 0) {
        segments.push({
          type: currentType,
          lines: currentLines,
          startLine: currentStart,
        });
      }
      currentType = type;
      currentLines = [lines[i]];
      currentStart = i + 1;
    } else {
      currentLines.push(lines[i]);
    }
  }
  if (currentLines.length > 0) {
    segments.push({
      type: currentType,
      lines: currentLines,
      startLine: currentStart,
    });
  }

  return segments
    .map(segment => {
      if (segment.type === 'code') {
        return renderCodeSegment(segment.lines, segment.startLine, lang);
      } else {
        const indent = Math.min(
          ...segment.lines.map(line => {
            const match = line.match(/^(\s*)\/\/\//);
            return match ? match[1].length : 0;
          }),
        );
        const prose = segment.lines
          .map(line => line.replace(/^\s*\/\/\/(\s?)/, ''))
          .join('\n');
        const source = escapeAttr(segment.lines.join('\n'));
        return `<div class="code-prose" data-prose-source="${source}" style="--prose-indent: ${indent}ch"><div class="code-prose-gutter"></div><div class="code-prose-content">${md.render(prose)}</div></div>`;
      }
    })
    .join('');
}

module.exports = { extractJavaMethodToc, renderCodeWithComments };
