import { mkdirSync, writeFileSync } from 'fs';
import path from 'path';

/**
 * Adds scripts in src/ and pages that list them. Returns site config YAML
 * that loads one script on every page.
 */
export function installAuthorModuleFixtures(siteDir: string): string {
  const srcDir = path.join(siteDir, 'src', 'modules');
  mkdirSync(srcDir, { recursive: true });

  // Counts are kept on window, so a full page load would reset them
  writeFileSync(
    path.join(siteDir, 'src', 'site-wide.ts'),
    `import type { Mount } from '@abreen/tada';

const mount: Mount = ({ window }) => {
  const w = window as unknown as {
    mountOrder?: string[];
    cleanupOrder?: string[];
  };
  (w.mountOrder ??= []).push('site-wide');
  window.document.documentElement.dataset.siteWideMounted = 'true';
  return () => {
    (w.cleanupOrder ??= []).push('site-wide');
  };
};
export default mount;
`,
  );
  writeFileSync(
    path.join(srcDir, 'counter.ts'),
    `import type { Mount } from '@abreen/tada';
import { counts } from './counts';

counts.evaluations++;

const mount: Mount = ({ window, signal }) => {
  const w = window as unknown as {
    mountOrder?: string[];
    cleanupOrder?: string[];
  };
  (w.mountOrder ??= []).push('counter');
  counts.mounts++;
  const marker = window.document.getElementById('module-marker')!;
  marker.textContent = \`mounted \${counts.mounts}, evaluated \${counts.evaluations}\`;
  window.addEventListener('module-ping', () => counts.pings++, { signal });
  signal.addEventListener('abort', () => counts.aborts++);
  return () => {
    (w.cleanupOrder ??= []).push('counter');
    counts.cleanups++;
  };
};
export default mount;
`,
  );
  writeFileSync(
    path.join(srcDir, 'counts.ts'),
    `export const counts = { evaluations: 0, mounts: 0, pings: 0, aborts: 0, cleanups: 0 };
(window as unknown as { moduleCounts: typeof counts }).moduleCounts = counts;
`,
  );
  writeFileSync(
    path.join(srcDir, 'delayed.ts'),
    `import type { Mount } from '@abreen/tada';

const mount: Mount = async ({ window }) => {
  await new Promise(resolve => window.setTimeout(resolve, 50));
  window.document.getElementById('delayed-marker')!.textContent =
    'delayed mount finished';
};
export default mount;
`,
  );
  writeFileSync(
    path.join(srcDir, 'styled.ts'),
    `import './styled.scss';
`,
  );
  writeFileSync(
    path.join(srcDir, 'styled.scss'),
    `#module-marker {
  font-style: italic;
}
`,
  );

  writeFileSync(
    path.join(siteDir, 'content', 'author-modules-start.md'),
    `---
title: Author Modules Start
---

[Go to the author modules page](author-modules.html)
`,
  );
  writeFileSync(
    path.join(siteDir, 'content', 'author-modules.md'),
    `---
title: Author Modules
scripts: [modules/counter.ts, modules/delayed.ts, modules/styled.ts]
---

<p id="module-marker">rendered without JavaScript</p>
<p id="delayed-marker">delayed mount pending</p>

[Back to the start page](author-modules-start.html)
`,
  );

  return 'scripts:\n  - site-wide.ts\n';
}
