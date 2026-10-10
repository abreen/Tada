import { writeFileSync } from 'fs';
import path from 'path';

export function installPageLayoutFixtures(siteDir: string): void {
  writeFileSync(
    path.join(siteDir, 'content', 'layout-toc-scroll.md'),
    `---\ntitle: TOC scrolling\ntoc: true\n---\n\n## First\n\n!!! note\nA note.\n!!!\n\n---\n\n<h2 id="unlisted">Unlisted</h2>\n\n${'Paragraph.\n\n'.repeat(30)}## Second\n\n${'Paragraph.\n\n'.repeat(30)}`,
  );
  writeFileSync(
    path.join(siteDir, 'content', 'layout-toc-short-end.md'),
    `---\ntitle: Short final sections\ntoc: true\n---\n\n## First\n\n${'Paragraph.\n\n'.repeat(30)}## Second\n\nParagraph.\n\n## Third\n\nParagraph.\n`,
  );
  writeFileSync(
    path.join(siteDir, 'content', 'layout-toc-many.md'),
    `---\ntitle: Long TOC\ntoc: true\n---\n\n${Array.from({ length: 60 }, (_, i) => `## Section ${i + 1}\n\nParagraph.\n\n`).join('')}`,
  );
  writeFileSync(
    path.join(siteDir, 'content', 'layout-toc-nested.md'),
    `---\ntitle: Nested TOC\ntoc: true\n---\n\n## Outer\n\n${'Paragraph.\n\n'.repeat(30)}### Inner\n\n${'Paragraph.\n\n'.repeat(30)}`,
  );
  for (const long of [false, true]) {
    const name = long ? 'layout-long' : 'layout-short';
    const paragraphs = long
      ? 'Content paragraph.\n\n'.repeat(80)
      : 'Short content.\n';
    for (const toc of [false, true]) {
      writeFileSync(
        path.join(siteDir, 'content', `${name}${toc ? '-toc' : ''}.md`),
        `---\ntitle: Layout\ntoc: ${toc}\n---\n\n## Section\n\n${paragraphs}`,
      );
    }
    writeFileSync(
      path.join(siteDir, 'content', `${name}.py`),
      `def example():\n    return 1\n${long ? '# More code\n'.repeat(100) : ''}`,
    );
    writeFileSync(
      path.join(siteDir, 'content', `${name}.java.md`),
      `---\ntitle: Literate layout\ntoc: true\n---\n\n## Section\n\n${paragraphs}\n\n\`\`\`\nclass Layout {}\n\`\`\`\n`,
    );
  }
}
