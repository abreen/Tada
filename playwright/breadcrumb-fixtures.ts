import { mkdirSync, writeFileSync } from 'fs';
import path from 'path';

export function installBreadcrumbFixtures(siteDir: string): void {
  const sectionDir = path.join(siteDir, 'content', 'breadcrumb-tests');
  const nestedDir = path.join(sectionDir, 'nested');
  mkdirSync(nestedDir, { recursive: true });
  writeFileSync(
    path.join(sectionDir, 'index.md'),
    `---
title: Section
breadcrumbs:
  - label: Home
    url: ../index.html
---

[Nested page](./nested/index.html)
`,
  );
  writeFileSync(
    path.join(nestedDir, 'index.md'),
    `---
title: Nested page
breadcrumbs:
  - label: Home
    url: ../../index.html
  - label: Section
    url: ../index.html
---

[First detail](./first.html)
`,
  );
  writeFileSync(
    path.join(nestedDir, 'long.md'),
    `---
title: A deliberately long current page title that cannot fit on a phone
toc: true
breadcrumbs:
  - label: Home
    url: ../../index.html
  - label: Section
    url: ../index.html
  - label: Nested page
    url: ./index.html
---

## Introduction

${'Paragraph.\n\n'.repeat(60)}## Target

Target paragraph.

${'Paragraph.\n\n'.repeat(60)}`,
  );
  for (const [name, title, sibling] of [
    ['first', 'First detail', 'second'],
    ['second', 'Second detail', 'first'],
  ]) {
    writeFileSync(
      path.join(nestedDir, `${name}.md`),
      `---
title: ${title}
breadcrumbs:
  - label: Home
    url: ../../index.html#home
  - label: Section
    url: ../index.html
  - label: Nested page
    url: ./index.html
---

[Sibling detail](./${sibling}.html)

[Different trail](/labs/00/index.html)
`,
    );
  }
}
