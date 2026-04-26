import { mkdirSync, rmSync, writeFileSync } from 'fs';
import path from 'path';

const repoDir = path.resolve(import.meta.dir, '..');
const tada = path.join(repoDir, 'bin', 'tada.ts');
const siteDir = path.join(repoDir, 'playwright', '.test-site');
const slidesPath = path.join(siteDir, 'content', 'slides.md');
const traceDir = path.join(siteDir, 'public', 'trace');

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

rmSync(siteDir, { recursive: true, force: true });

await run([
  'bun',
  tada,
  'init',
  siteDir,
  '--no-interactive',
  '--default-time-zone',
  'America/New_York',
]);

mkdirSync(path.dirname(slidesPath), { recursive: true });
mkdirSync(traceDir, { recursive: true });
writeFileSync(
  path.join(traceDir, 'manifest.json'),
  JSON.stringify({
    totalSteps: 1,
    chunkSize: 10,
    sourceFile: 'slides-trace.java',
    source: 'trace demo',
    lineToSteps: {},
  }),
);
writeFileSync(
  path.join(traceDir, 'chunk-0.json'),
  JSON.stringify([
    {
      line: 1,
      stdout: 'output',
      svg: `<svg class="trace-memory" width="640" height="480" viewBox="0 0 640 480">
  <rect x="20" y="20" width="600" height="440" fill="none" stroke="currentColor"></rect>
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
      <div class="trace-source-wrapper">
        <div class="trace-source">
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
`,
);

await run(['bun', tada, 'dev'], siteDir);
await run(['bun', tada, 'serve', '--port', '8081'], siteDir);
