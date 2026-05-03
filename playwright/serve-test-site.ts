import { mkdirSync, rmSync, writeFileSync } from 'fs';
import path from 'path';

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
const timezonesPath = path.join(siteDir, 'content', 'timezones.md');
const traceDir = path.join(siteDir, 'public', 'trace');
const resetTraceDir = path.join(siteDir, 'public', 'trace-reset');
const coverageEnabled = process.argv.slice(2).includes('--coverage');

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
  '--default-time-zone',
  'America/New_York',
]);

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

# Middle

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
  timezonesPath,
  `---
title: Timezones
---

<%= renderTimeZoneChooser() %>

<%= renderTimeZoneChooser() %>

Default meeting: <time datetime="17:40">5:40 PM</time>

Previous-day meeting: <time datetime="01:30">1:30 AM</time>

Next-day meeting: <time datetime="23:30">11:30 PM</time>

Plain same-period meeting: <time datetime="17:40">5:40</time>

Plain period-changing meeting: <time datetime="11:30">11:30</time>
`,
);

await runTada(['dev'], siteDir);
await runTada(['serve', '--port', '8081'], siteDir);
