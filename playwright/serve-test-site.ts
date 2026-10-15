import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import path from 'path';
import { installCustomFontFixtures } from './custom-font-fixtures';
import { installPageLayoutFixtures } from './page-layout-fixtures';
import { installBreadcrumbFixtures } from './breadcrumb-fixtures';
import { installAuthorModuleFixtures } from './author-module-fixtures';
import { portArgument } from './ports';

const repoDir = path.resolve(import.meta.dir, '..');
const tada = path.join(repoDir, 'bin', 'tada.ts');
const coveragePreload = path.join(
  repoDir,
  'scripts',
  'coverage-preload-playwright.ts',
);
const siteDir = path.join(repoDir, 'playwright', '.test-site');
const slidesPath = path.join(siteDir, 'content', 'slides.md');
const resetSlidesPath = path.join(siteDir, 'content', 'slides-reset.md');
const externalLinkWrappingPath = path.join(
  siteDir,
  'content',
  'external-link-wrapping.md',
);
const traceDir = path.join(siteDir, 'public', 'trace');
const resetTraceDir = path.join(siteDir, 'public', 'trace-reset');
const coverageEnabled = process.argv.slice(2).includes('--coverage');
const port = portArgument(process.argv.slice(2));

async function run(args: string[], cwd = repoDir): Promise<void> {
  const proc = Bun.spawn(args, {
    cwd,
    stdio: ['inherit', 'inherit', 'inherit'],
    env: process.env,
  });
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    process.exit(exitCode);
  }
}

async function runTada(args: string[], cwd = repoDir): Promise<void> {
  const command = ['bun'];
  if (coverageEnabled) {
    command.push('--preload', coveragePreload);
  }
  command.push(tada, ...args);
  await run(command, cwd);
}

rmSync(siteDir, { recursive: true, force: true });

await runTada([
  'init',
  siteDir,
  '--no-interactive',
  // Long enough for the header title to truncate in narrow layouts
  '--title',
  'Introduction to Computer Science',
]);

const devConfigPath = path.join(siteDir, 'site.dev.yaml');
const devConfig = readFileSync(devConfigPath, 'utf-8');
const devConfigWithoutFooter = devConfig.replace(
  '  footer: true',
  '  footer: false',
);
if (devConfigWithoutFooter === devConfig) {
  throw new Error('Could not disable the footer in the Playwright test site');
}
writeFileSync(
  devConfigPath,
  `${devConfigWithoutFooter}${installCustomFontFixtures(repoDir, siteDir)}${installAuthorModuleFixtures(siteDir)}`,
);

writeFileSync(
  path.join(siteDir, 'content', 'questions.md'),
  String.raw`---
title: Questions
---

??? question What is a fraction?
A <dfn>fraction</dfn> such as $\frac{1}{\sqrt{x}}$ describes a ratio.

A second paragraph with **emphasis** and [a link](./slides.html).
???
`,
);

writeFileSync(
  path.join(siteDir, 'content', 'tabs.md'),
  `---
title: Tabs
---

[Link to the Python heading](#python-details)

${'Filler before the tabs.\n\n'.repeat(40)}
[Java|

Java content with [a link](./questions.html).

]
[Python|

### Python details

Python content.

]
[Rust|

Rust content.

Ferris is the Rust mascot.

]
`,
);

// Numbered tabs, with a first step taller than the viewport
writeFileSync(
  path.join(siteDir, 'content', 'stepper.md'),
  `---
title: Stepper
---

[1. Install|

${'Install content.\n\n'.repeat(60)}
]
[2. Configure|

Configure content.

]
[3. Run|

Run content.

]
`,
);

// More tabs than fit on one row in a narrow viewport
writeFileSync(
  path.join(siteDir, 'content', 'tabs-many.md'),
  `---
title: Many Tabs
---

${[
  'Java',
  'Python',
  'Rust',
  'Go',
  'Kotlin',
  'Swift',
  'TypeScript',
  'Haskell',
  'Elixir',
  'Clojure',
]
  .map(label => `[${label}|\n\n${label} content.\n\n]`)
  .join('\n')}
`,
);

mkdirSync(path.dirname(slidesPath), { recursive: true });
mkdirSync(traceDir, { recursive: true });
mkdirSync(resetTraceDir, { recursive: true });
writeFileSync(
  path.join(traceDir, 'manifest.json'),
  JSON.stringify({
    totalSteps: 1,
    chunkSize: 10,
    primaryFile: 'slides-trace.java',
    sources: [
      { file: 'slides-trace.java', source: 'trace demo', lineToSteps: {} },
    ],
  }),
);
writeFileSync(
  path.join(traceDir, 'chunk-0.json'),
  JSON.stringify([
    {
      file: 'slides-trace.java',
      line: 1,
      output: [{ stream: 'stdout', text: 'output' }],
      svg: `<svg class="trace-memory" width="640" height="480" viewBox="0 0 640 480">
  <rect x="20" y="20" width="600" height="440" fill="none" stroke="currentColor"></rect>
</svg>`,
    },
  ]),
);
writeFileSync(
  path.join(resetTraceDir, 'manifest.json'),
  JSON.stringify({
    totalSteps: 2,
    chunkSize: 10,
    primaryFile: 'slides-reset-trace.java',
    sources: [
      {
        file: 'slides-reset-trace.java',
        source: 'trace reset demo',
        lineToSteps: {},
      },
    ],
  }),
);
writeFileSync(
  path.join(resetTraceDir, 'chunk-0.json'),
  JSON.stringify([
    {
      file: 'slides-reset-trace.java',
      line: 1,
      output: [],
      svg: `<svg class="trace-memory" width="640" height="480" viewBox="0 0 640 480">
  <text x="20" y="40">step 1</text>
</svg>`,
    },
    {
      file: 'slides-reset-trace.java',
      line: 2,
      output: [{ stream: 'stdout', text: 'done' }],
      svg: `<svg class="trace-memory" width="640" height="480" viewBox="0 0 640 480">
  <text x="20" y="40">step 2</text>
</svg>`,
    },
  ]),
);
writeFileSync(
  slidesPath,
  `---
title: Slides
slides: true
---

# Intro

---

## Middle

<input aria-label="Slide notes">

---

# End

<div class="trace-widget" data-trace-manifest="/trace/manifest.json">
  <div class="trace-body">
    <div class="trace-toolbar">
      <div class="trace-controls" role="toolbar" aria-label="Trace navigation">
        <button class="trace-btn trace-first" disabled tabindex="-1">First</button>
        <button class="trace-btn trace-prev" disabled tabindex="-1">Prev</button>
        <span class="trace-step-counter"></span>
        <button class="trace-btn trace-next" disabled tabindex="-1">Next</button>
        <button class="trace-btn trace-last" disabled tabindex="-1">Last</button>
      </div>
    </div>
    <div class="trace-content">
      <div class="trace-diagram"></div>
      <div class="trace-resizer" role="separator" aria-label="Resize trace panes" aria-orientation="horizontal" tabindex="0"></div>
      <div class="trace-source-wrapper">
        <div class="trace-source" data-trace-source-file="slides-trace.java">
          <pre><span class="code-row trace-line-active"><span class="line-number" data-line="1">1</span><code>trace demo</code></span></pre>
        </div>
      </div>
      <pre class="trace-output">output</pre>
    </div>
  </div>
</div>

??? question What is three times four?

The answer is twelve.

???

??? question Which option is correct?
- [ ] Eleven
- [x] Twelve
???
`,
);
writeFileSync(
  resetSlidesPath,
  `---
title: Slides Reset
slides: true
---

# Intro

---

# Trace

<div class="trace-widget" data-trace-manifest="/trace-reset/manifest.json">
  <div class="trace-body">
    <div class="trace-toolbar">
      <div class="trace-controls" role="toolbar" aria-label="Trace navigation">
        <button class="trace-btn trace-first" disabled tabindex="-1">First</button>
        <button class="trace-btn trace-prev" disabled tabindex="-1">Prev</button>
        <span class="trace-step-counter"></span>
        <button class="trace-btn trace-next" disabled tabindex="-1">Next</button>
        <button class="trace-btn trace-last" disabled tabindex="-1">Last</button>
      </div>
    </div>
    <div class="trace-content">
      <div class="trace-diagram"></div>
      <div class="trace-resizer" role="separator" aria-label="Resize trace panes" aria-orientation="horizontal" tabindex="0"></div>
      <div class="trace-source-wrapper">
        <div class="trace-source" data-trace-source-file="slides-reset-trace.java">
          <pre><span class="code-row trace-line-active"><span class="line-number" data-line="1">1</span><code>trace reset demo</code></span>
<span class="code-row"><span class="line-number" data-line="2">2</span><code>done</code></span></pre>
        </div>
      </div>
    </div>
  </div>
</div>

---

# Wrap
`,
);
writeFileSync(
  externalLinkWrappingPath,
  `---
title: External Link Wrapping
---

August 5, 3:15-5:15 pm, [Science Center](https://example.com), hall A.
`,
);

writeFileSync(
  path.join(siteDir, 'content', 'footnote-line-height.md'),
  `---
title: Footnote Line Height
---

A line without a footnote reference.

A line with a footnote reference.[^1]

[^1]: The footnote.
`,
);

const longDetailsParagraphs = Array.from({ length: 40 }, (_, i) =>
  i === 19
    ? '<p id="long-details-target">The target paragraph of the long details element.</p>'
    : `Paragraph ${i + 1} of the long details element.`,
).join('\n\n');
writeFileSync(
  path.join(siteDir, 'content', 'long-details.md'),
  `---
title: Long Details
---

<details>
<summary>Short details</summary>

The only paragraph of the short details element.

</details>

<details>
<summary>Long details</summary>

${longDetailsParagraphs}

The last paragraph of the long details element.

</details>

${Array.from({ length: 40 }, (_, i) => `Paragraph ${i + 1} after the details.`).join('\n\n')}

<details open>
<summary><input type="checkbox" aria-label="Done"> Checkbox details</summary>

The body of the checkbox details element.

</details>
`,
);

const previewParagraphs = Array.from({ length: 40 }, (_, i) =>
  i === 0
    ? 'Paragraph 1 of the preview, with <button type="button">a button</button>.'
    : i === 24
      ? 'Paragraph 25 of the preview mentions a zebra.'
      : i === 29
        ? 'Paragraph 30 of the preview, with [a link](#preview-end).'
        : `Paragraph ${i + 1} of the preview.`,
).join('\n\n');
writeFileSync(
  path.join(siteDir, 'content', 'details-preview.md'),
  `---
title: Details Preview
---

${Array.from({ length: 20 }, (_, i) => `Paragraph ${i + 1} before the preview.`).join('\n\n')}

<details>

${previewParagraphs}

<p id="preview-end">The last paragraph of the preview.</p>

</details>

<details>

The only paragraph of the short preview.

</details>

${Array.from({ length: 40 }, (_, i) => `Paragraph ${i + 1} after the preview.`).join('\n\n')}
`,
);

writeFileSync(
  path.join(siteDir, 'content', 'author-scripts-start.md'),
  `---
title: Author Scripts Start
---

[Go to the author scripts page](author-scripts.html)
`,
);
writeFileSync(
  path.join(siteDir, 'content', 'author-scripts.md'),
  `---
title: Author Scripts
---

<p id="inline-marker">inline did not run</p>
<p id="inline-location">inline did not run</p>
<p id="external-marker">external did not run</p>

<script>
  window.inlineRuns = (window.inlineRuns || 0) + 1;
  document.getElementById('inline-marker').textContent =
    'inline ran ' + window.inlineRuns;
  document.getElementById('inline-location').textContent =
    location.pathname + ' | ' + document.title;
</script>
<script src="/author-script.js"></script>

[Back to the start page](author-scripts-start.html)
`,
);
writeFileSync(
  path.join(siteDir, 'public', 'author-script.js'),
  `window.externalRuns = (window.externalRuns || 0) + 1;
document.getElementById('external-marker').textContent =
  'external ran ' + window.externalRuns;
`,
);

writeFileSync(
  path.join(siteDir, 'content', 'Interleaved.java'),
  `class Interleaved {
  int firstField;
  void firstMethod() {}
  int secondField;
  void secondMethod() {}
}
`,
);

installPageLayoutFixtures(siteDir);
installBreadcrumbFixtures(siteDir);

await runTada(['dev'], siteDir);
await runTada(['serve', '--port', port], siteDir);
