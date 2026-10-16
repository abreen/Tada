#!/usr/bin/env bun
// Drive a built Tada site in headless Chromium.
//
//   bun .claude/skills/run-tada/driver.ts <siteDir> [--out <dir>] <<'EOF'
//   goto /index.html
//   shot home
//   EOF
//
// Starts `tada serve` (this checkout's bin/tada.ts) on a free port in
// <siteDir>, reads one command per line from stdin, runs each against one
// page, prints results, then stops the server. <siteDir> must already be
// built (`tada dev`). Run from the repo root.
//
// Commands:
//   goto <path>            navigate (path relative to the server root)
//   shot <name>            viewport screenshot -> <out>/<name>.png
//   fullshot <name>        full-page screenshot (unreadable on long pages)
//   click <selector>       click (Playwright selector: css, text=..., role=...)
//   fill <selector> | <txt> fill an input (" | " separates selector and text)
//   press <key>            keyboard press, e.g. Enter, Escape, Control+k
//   wait <ms|selector>     sleep, or wait for a selector to be visible
//   text <selector>        print innerText of the first match
//   count <selector>       print the number of matches
//   attr <selector> <name> print an attribute of the first match (the name
//                          is the last word; the selector may have spaces)
//   eval <js>              evaluate an expression in the page, print JSON
//   url                    print the current URL
//   viewport <w> <h>       resize, e.g. 375 812 for phone width
//   scheme <light|dark>    emulate prefers-color-scheme
//   nojs                   reopen the page with JavaScript disabled
//   js                     reopen the page with JavaScript enabled again
//   # ...                  comment
// Selectors may contain spaces. A selector that matches nothing fails after
// 5s (navigation gets 30s). Console errors and page errors are printed as
// they happen. Exits 1 if any command failed.
import {
  chromium,
  type Browser,
  type BrowserContextOptions,
  type Page,
} from '@playwright/test';
import net from 'net';
import path from 'path';
import fs from 'fs';

const repoDir = path.resolve(import.meta.dir, '../../..');
const args = process.argv.slice(2);
const outIdx = args.indexOf('--out');
const outArg = outIdx !== -1 ? args.splice(outIdx, 2)[1] : undefined;
const siteDir = args[0] && path.resolve(args[0]);
if (!siteDir || !fs.existsSync(path.join(siteDir, 'dist'))) {
  console.error(
    'usage: driver.ts <builtSiteDir> [--out dir] < commands  (run `tada dev` in the site first)',
  );
  process.exit(2);
}
if (process.stdin.isTTY) {
  console.error('driver.ts reads commands from stdin; pipe or heredoc them');
  process.exit(2);
}
// Default: <siteDir>/driver-shots (example/ is gitignored)
const outDir = path.resolve(outArg ?? path.join(siteDir, 'driver-shots'));
fs.mkdirSync(outDir, { recursive: true });

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.on('error', reject);
    s.listen(0, () => {
      const port = (s.address() as net.AddressInfo).port;
      s.close(() => resolve(port));
    });
  });
}

const port = await freePort();
const base = `http://localhost:${port}`;
const server = Bun.spawn(
  ['bun', path.join(repoDir, 'bin/tada.ts'), 'serve', '--port', String(port)],
  { cwd: siteDir, stdout: 'ignore', stderr: 'inherit' },
);

// A signal skips the finally below, so stop the server here too
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
  process.on(signal, () => {
    server.kill();
    process.exit(130);
  });
}

async function waitForServer() {
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null) {
      throw new Error(`tada serve exited with code ${server.exitCode}`);
    }
    try {
      await fetch(`${base}/`);
      return;
    } catch {
      await Bun.sleep(100);
    }
  }
  throw new Error(`tada serve did not start on ${base}`);
}

let browser: Browser | undefined;
let page: Page;
let contextOpts: BrowserContextOptions = {
  viewport: { width: 1280, height: 900 },
};

// Reopen the current URL in a new context with different options, carrying
// over cookies and localStorage (where preferences like the font live)
async function reopenPage(opts: BrowserContextOptions) {
  const url = page.url();
  const storageState = await page.context().storageState();
  await page.context().close();
  contextOpts = { ...contextOpts, ...opts };
  await openPage(url, storageState);
}

async function openPage(
  url?: string,
  storageState?: BrowserContextOptions['storageState'],
) {
  const context = await browser!.newContext({ ...contextOpts, storageState });
  // Fail fast on a selector that matches nothing; page loads keep 30s
  context.setDefaultTimeout(5_000);
  context.setDefaultNavigationTimeout(30_000);
  page = await context.newPage();
  page.on('console', m => {
    if (m.type() === 'error') {
      console.log(`[console.error] ${m.text()}`);
    }
  });
  page.on('pageerror', e => console.log(`[pageerror] ${e.message}`));
  if (url && url !== 'about:blank') {
    await page.goto(url);
  }
}

async function run(line: string) {
  const [, cmd, arg] = line.match(/^(\S+)\s*(.*)$/)!;
  const rest = arg.split(/\s+/);
  switch (cmd) {
    case 'goto': {
      const res = await page.goto(new URL(arg, base + '/').href);
      // No response for same-document navigation, e.g. a hash change
      console.log(`${res ? res.status() : 'same-document'} ${page.url()}`);
      break;
    }
    case 'shot':
    case 'fullshot': {
      const file = path.join(outDir, `${arg || 'shot'}.png`);
      await page.screenshot({ path: file, fullPage: cmd === 'fullshot' });
      console.log(file);
      break;
    }
    case 'click':
      await page.locator(arg).first().click();
      break;
    case 'fill': {
      const sep = arg.indexOf(' | ');
      if (sep === -1) {
        throw new Error('usage: fill <selector> | <text>');
      }
      await page
        .locator(arg.slice(0, sep))
        .first()
        .fill(arg.slice(sep + 3));
      break;
    }
    case 'press':
      await page.keyboard.press(arg);
      break;
    case 'wait':
      if (/^\d+$/.test(arg)) {
        await page.waitForTimeout(Number(arg));
      } else {
        await page.locator(arg).first().waitFor({ state: 'visible' });
      }
      break;
    case 'text':
      console.log(await page.locator(arg).first().innerText());
      break;
    case 'count':
      console.log(await page.locator(arg).count());
      break;
    case 'attr': {
      const name = rest.pop()!;
      const sel = rest.join(' ');
      console.log(await page.locator(sel).first().getAttribute(name));
      break;
    }
    case 'eval':
      console.log(JSON.stringify(await page.evaluate(arg)));
      break;
    case 'url':
      console.log(page.url());
      break;
    case 'viewport':
      await page.setViewportSize({ width: +rest[0], height: +rest[1] });
      contextOpts = {
        ...contextOpts,
        viewport: { width: +rest[0], height: +rest[1] },
      };
      break;
    case 'scheme':
      await page.emulateMedia({ colorScheme: arg as 'light' | 'dark' });
      contextOpts = { ...contextOpts, colorScheme: arg as 'light' | 'dark' };
      break;
    case 'nojs':
      await reopenPage({ javaScriptEnabled: false });
      break;
    case 'js':
      await reopenPage({ javaScriptEnabled: true });
      break;
    default:
      throw new Error(`unknown command: ${cmd}`);
  }
}

let failed = false;
try {
  await waitForServer();
  console.log(`serving ${siteDir}/dist at ${base}`);
  browser = await chromium.launch();
  await openPage();
  const input = await Bun.stdin.text();
  for (const raw of input.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }
    console.log(`> ${line}`);
    try {
      await run(line);
    } catch (e) {
      failed = true;
      console.log(`!! ${(e as Error).message.split('\n')[0]}`);
    }
  }
} finally {
  await browser?.close();
  server.kill();
}
process.exit(failed ? 1 : 0);
