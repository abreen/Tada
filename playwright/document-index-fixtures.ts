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
}
