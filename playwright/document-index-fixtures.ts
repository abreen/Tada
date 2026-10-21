import { mkdirSync, writeFileSync } from 'fs';
import path from 'path';

export const LONG_DOCUMENT_TITLE =
  'A deliberately long document index label that remains fully readable across multiple lines';
export const UNBROKEN_DOCUMENT_TITLE = 'LongUnbrokenTitle'.repeat(8);

// A document tree of its own, so its pages do not depend on the starter
// content: a root, a long page with a TOC, wrapping titles, and a code page
export function installDocumentIndexFixtures(siteDir: string): void {
  const dir = path.join(siteDir, 'content', 'document-index-tests');
  mkdirSync(dir, { recursive: true });
  const page = (name: string, frontMatter: string, body: string) =>
    writeFileSync(path.join(dir, name), `---\n${frontMatter}\n---\n\n${body}`);

  page('index.md', 'title: Guide', 'The guide.\n');
  page(
    'long.md',
    'title: Long page\ntoc: true',
    Array.from(
      { length: 6 },
      (_, i) => `## Part ${i + 1}\n\n${'Paragraph.\n\n'.repeat(15)}`,
    ).join(''),
  );
  page('long-label.md', `title: ${LONG_DOCUMENT_TITLE}`, 'Long title.\n');
  page('long-word.md', `title: ${UNBROKEN_DOCUMENT_TITLE}`, 'Long word.\n');
  writeFileSync(
    path.join(dir, 'Example.java'),
    'public class Example {\n    void run() {}\n}\n',
  );
  writeFileSync(
    path.join(dir, 'index.yml'),
    `page: index.md
children:
  - page: long.md
    children:
      - long-label.md
      - long-word.md
  - Example.java
`,
  );
  installTallDocumentIndexFixtures(siteDir);
}

export const TALL_DOCUMENT_PAGES = 40;

// A long page body, so the page scrolls far enough for the sidebar to stick
const longBody = (parts: number) =>
  Array.from(
    { length: parts },
    (_, i) => `## Part ${i + 1}\n\n${'Paragraph.\n\n'.repeat(30)}`,
  ).join('');

// How many sections each page with a TOC has: page 20's TOC is short and page
// 25's is longer than the sidebar. The other pages, such as page 30, have no
// TOC.
const TOC_PARTS = new Map([
  [20, 6],
  [25, 40],
]);

// A flat tree with more entries than fit in the sidebar
function installTallDocumentIndexFixtures(siteDir: string): void {
  const dir = path.join(siteDir, 'content', 'document-index-tall-tests');
  mkdirSync(dir, { recursive: true });
  const names = Array.from(
    { length: TALL_DOCUMENT_PAGES },
    (_, i) => `page-${String(i + 1).padStart(2, '0')}.md`,
  );
  writeFileSync(
    path.join(dir, 'index.md'),
    '---\ntitle: Tall guide\n---\n\nThe guide.\n',
  );
  names.forEach((name, i) => {
    const parts = TOC_PARTS.get(i + 1);
    writeFileSync(
      path.join(dir, name),
      `---\ntitle: Tall page ${i + 1}\ntoc: ${parts !== undefined}\n---\n\n${longBody(parts ?? 1)}`,
    );
  });
  writeFileSync(
    path.join(dir, 'index.yml'),
    `page: index.md\nchildren:\n${names.map(name => `  - ${name}\n`).join('')}`,
  );
}
