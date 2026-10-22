---
name: run-tada
description: Run, build, serve, and drive the Tada static site generator against its example site. Use when asked to run tada, build or preview the example site, start the dev/watch server, screenshot a generated page, click through a built site in a browser, check a page with JavaScript off, or confirm a build/, src/, or templates/ change works in the real output.
---

# Run Tada

Tada is a CLI (`bin/tada.ts`) that turns a site directory into static HTML in
`<site>/dist/`. This repo is the package, not a site, so you always run it
against a site: `example/` (gitignored, made by `bun run init-example`).

The agent path is **build the site, then pipe commands to
`.claude/skills/run-tada/driver.ts`**. The driver starts `tada serve` on a
free port, drives headless Chromium (Playwright from `node_modules`), prints
results, saves screenshots, and stops the server. All paths below are relative
to the repo root.

## Prerequisites

- `bun` ≥ 1.3.12, `bun install` done (provides `@playwright/test`).
- Playwright's Chromium in `~/Library/Caches/ms-playwright` (macOS), the same
  browser `bun run test:playwright` uses. It was already installed when this
  skill was written; installing it was not tested.
- In Claude Code cloud sessions, run `bun install` first. If Playwright's own
  Chromium is missing, the driver uses the preinstalled
  `/opt/pw-browsers/chromium`. Don't run `playwright install`.
- Optional: `javac` and Python 3 for the trace feature. Without them the
  build logs a warning and disables traces; it does not fail.

## Build

```bash
bun run init-example
```

Skip that if `example/` exists (`init` refuses to overwrite). Then build:

```bash
cd example && ../bin/tada.ts dev
```

Takes ~4s. Output goes to `example/dist/`. Rebuild after every code change;
the driver serves whatever is in `dist/`.

## Run (agent path): the driver

```bash
bun .claude/skills/run-tada/driver.ts example <<'EOF'
goto /index.html
eval document.title
click input.quick-search
fill input.quick-search | rectangle
wait 1500
eval [...document.querySelectorAll('#quick-search-results a')].slice(0,3).map(a=>a.getAttribute('href'))
shot search
press Escape
click text=Markdown examples page
wait 500
url
text h1
click [data-font-preference-switch]
wait 1500
attr [data-font-preference-switch] aria-checked
attr #quick-search-results a href
scheme dark
viewport 375 812
eval scrollTo(0, 0)
shot markdown-dark-phone
nojs
eval document.documentElement.className
js
eval document.documentElement.className
eval document.documentElement.dataset.fontPreference
EOF
```

Each command echoes as `> cmd` then prints its result; failures print
`!! message`, the driver keeps going, and it exits 1. Browser console errors
and page errors print as `[console.error]` / `[pageerror]`. Screenshots go to
`example/driver-shots/<name>.png` (override with `--out <dir>`). **Open the
PNG and look at it.**

Commands (full list in the header of `driver.ts`): `goto <path>`,
`shot <name>` (viewport), `fullshot <name>`, `click <sel>`,
`fill <sel> | <text>`, `press <key>`, `wait <ms|sel>`, `text <sel>`,
`count <sel>`, `attr <sel> <name>`, `eval <js>`, `url`, `viewport <w> <h>`,
`scheme light|dark`, `nojs`, `js`. Selectors are Playwright selectors (CSS,
`text=...`, `role=button[name="..."]`) and may contain spaces. `fill` needs
` | ` between selector and text; `attr` takes the attribute name as its last
word. Commands that need an element (`click`, `fill`, `text`, `attr`,
`wait <sel>`) fail after 5s if the selector matches nothing; `goto` gets
30s. Without stdin piped in, the driver exits 2 instead of waiting.

Useful pages in the example site: `/index.html`, `/markdown.html` (every
Markdown feature), `/lectures/01/Rectangle.java.html` (code page with TOC),
`/labs/01/index.html` (traces).

### Checking progressive enhancement

`nojs` reopens the current URL in a fresh context with JavaScript disabled;
`js` switches it back. Viewport, color scheme, cookies, and localStorage
(including the font and contrast preferences) carry over. With JS on,
`<html>` has class `js`; with `nojs` it's `""`. Use this to confirm a feature
still renders useful HTML without JS, as `AGENTS.md` requires.

## Run: watch mode (rebuild + live reload)

For `build/watch/` changes. Runs until killed; launch in the background:

```bash
cd example && ../bin/tada.ts watch --port 8765
```

Ready when `curl -sf http://localhost:8765/index.html` succeeds (~5s, it does
a full build first). Editing `example/content/index.md` logged
`index.md changed, rebuilding` and the new text was served within ~1s. Stop
with `pkill -f "tada.ts watch --port 8765"`. The driver uses `serve`, not
`watch`; for watch, check with `curl`.

## Production build

```bash
cd example && ../bin/tada.ts prod
```

Writes versioned output to `example/dist-prod/v<N>/`.

## Direct invocation (internals)

Most `build/` changes need only a focused unit test, not the browser:

```bash
bun run test:unit build/serve.test.ts
```

Don't use `bun test`. Full suites: `bun run test:playwright`,
`bun run test:functional` (slow, >2 min). See `AGENTS.md`.

## Run (human path)

`cd example && ../bin/tada.ts watch` and open `http://localhost:8080/index.html`.
Don't run `tada dev`/`prod` in the repo root: there is no site there.

## Gotchas

- **The font switch commits late.** Clicking `[data-font-preference-switch]`
  to choose serif first loads the serif font. `aria-checked` and
  `<html data-font-preference>` stay unchanged until the font arrives, so
  read them right after the click and you see the old value. `wait 1500`
  first.
- **Clicking the footer pickers scrolls the page** to the footer. Later
  `shot`s show mid-page; run `eval scrollTo(0, 0)` first.
- **`fullshot` of a long page is useless.** `/markdown.html` is ~13,000px
  tall; the image gets downscaled to a sliver. Use `shot` plus `viewport`
  or `eval document.querySelector(sel).scrollIntoView()`.
- **Links navigate client-side.** Right after `click` on a link, `url` and
  `text h1` still show the old page. `wait 500` (or `wait <selector>`) first.
- **Search needs the pagefind index,** which the `dev` build writes. Results
  appear asynchronously in `#quick-search-results`, so `wait` after `fill`.
- **`example/` is a snapshot of `init/`** from when it was created. Changes to
  `init/` content don't reach it. Delete it and rerun `bun run init-example`
  only if you know it holds nothing you need (it's gitignored, so local edits
  are lost).
- The site's `base` is `http://localhost:8080`, but the driver serves on a
  random port. Internal links are root-relative, so navigation still works.

## Troubleshooting

- `usage: driver.ts <builtSiteDir> ...`: the site has no `dist/`. Run
  `../bin/tada.ts dev` in it first.
- `driver.ts reads commands from stdin; pipe or heredoc them`: you ran the
  driver at a terminal with nothing piped in. Use the heredoc form above.
- `tada serve exited with code N`: the server died before answering. Its
  stderr is printed just above; fix that and rerun.
- `!! usage: fill <selector> | <text>`: `fill` needs ` | ` (with spaces)
  between the selector and the text.
- `Error: "example" already exists` from `init-example`: use the existing
  `example/`, or delete it as described in Gotchas.
- `bun run test:unit build/foo.test.ts` fails with a `BunShell` stack
  trace: the test file doesn't exist. Check the path.
