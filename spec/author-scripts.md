# Author Scripts

A site can include its own TypeScript or JavaScript in a `src/` directory next
to `content/`. Tada compiles the scripts that pages list, along with everything
they import, using Bun. Nothing in `src/` is published as-is, so `.ts` and `.js`
files in `content/` keep their usual meaning (copied files or
[code pages](code-pages.md)) while the site's own code lives in `src/`.

## Listing scripts

A page lists scripts in its front matter. Paths are relative to `src/`:

```
---
title: Lectures
scripts: [lectures/timezone.ts]
---
```

The site config `scripts` field lists scripts that every page loads, including
code pages, which have no front matter (see [Configuration](configuration.md)).
A page loads the site-wide scripts first, then its own, each once.

Each path must be a relative POSIX path ending in `.ts` or `.js`, with no `.`
or `..` segments, backslashes, `?`, or `#`. A malformed path or one that names
no file in `src/` fails the build. Errors name the page, for example
`content/lectures/index.md: script "lectures/timezon.ts" not found in src/`; a
site-wide script error names its index in the config `scripts` list. A script
that fails to compile fails the build with its file, line, column, and reason.

Only listed scripts and their imports are compiled. Other files in `src/` are
ignored. Imports can be relative files in `src/`; Tada does not install
packages. `src/` and directories in it may be symbolic links.

A script can import code, stylesheets, and JSON, TOML, YAML, or text files,
whose contents become part of the bundle. Importing any other file, such as an
image, fails the build, for example
`src/lectures/clock.ts: cannot import "./logo.png": ...`. Put images and other
files in `content/` or `public/`, which publish them at stable URLs, and refer
to them by URL.

## Writing a script

A script's default export is a mount function. Tada calls it each time the page
is shown: on a full page load and after each client-side navigation to the page.
Code at the top level of the module runs once per visit, because the browser
evaluates an ES module only once.

```ts
import type { Mount } from '@abreen/tada';

const mount: Mount = ({ window, signal }) => {
  const button = window.document.querySelector('#greet');
  button?.addEventListener('click', () => alert('Hello'), { signal });
  return () => {
    // Undo anything the signal does not cover
  };
};
export default mount;
```

The mount function receives `{ window, signal }`. The `AbortSignal` aborts when
the visitor leaves the page, so listeners and fetches that take it are cleaned
up automatically. The function can return a cleanup function, which runs right
after the signal aborts. It can also be `async`. If the visitor leaves while an
async mount is still running, the signal aborts right away, and the cleanup
function it returns runs as soon as it finishes.

A module without a default export is loaded but nothing is mounted. A failed
import, a default export that is not a function, a mount that throws or
rejects, or a cleanup function that throws logs an error to the console, in
production builds as well as development builds. Errors name the script and
say whether mounting or cleaning up failed. The other scripts are not
affected.

Scripts mount after Tada's own page components. Each module starts loading at
once, in parallel, and mount functions are called in the order the page lists
them, as each module loads. A mount function does not wait for an earlier
async mount to finish. Navigation does not wait for scripts either: it
finishes, and dispatches `tada:navigation`, once Tada's own components are
mounted, even if a script is still loading or an async mount has not finished.
Scripts that finish loading after the visitor has left their page are not
mounted.

### Types

The `@abreen/tada` package publishes the `Mount`, `MountOptions`, `Unmount`, and
`NavigationEventDetail` types, and types the `tada:navigation` event on
`window`. Import them with `import type`, which is removed when compiling, so a
site builds without installing anything. For editor type checking, run
`bun install` in a site created by `tada init`, which writes a `package.json`
listing `@abreen/tada` and a `tsconfig.json` for `src/` (see
[Site Initialization](site-init.md)).

## Styles

A script can import `.scss` or `.css` files. Tada compiles Sass and adds each
script's styles as `<link rel="stylesheet" data-tada-style>` in the `<head>` of
the pages that load the script, after Tada's own stylesheet. Styles work with
JavaScript turned off. On a client-side navigation, the new page's stylesheets
are loaded before its content is shown, so it never appears unstyled, and the
loading indicator stays on while they load. Navigation waits at most 3 seconds
for them, and a stylesheet that fails to load does not stop it. Stylesheets of
a navigation that is abandoned, such as by following another link, are removed.
Stylesheets of the previous page that the new page does not load are removed.

A stylesheet can `@import` CSS, or `@use` and `@import` Sass, only from files in
`src/`; a path that leads outside `src/` fails the build.

A stylesheet can reference files in `src/`, such as fonts and images, with
relative `url()` paths. They resolve from the stylesheet a script imports; as
usual with Sass, paths in partials are not rewritten, so write them relative to
the file that uses the partial. Each file is published unchanged at its path
under `_scripts/`, with a content hash in its name, or inlined as a data URL
when small. A relative `url()` that leads outside `src/`
fails the build. To use a file from `content/` or `public/`, write an absolute
URL such as `url(/images/paper.png)`: like absolute links in pages, Tada adds
the site base path, so it becomes `url(/course/images/paper.png)` with a base
path of `/course`. Full URLs and data URLs are left unchanged.

To match the site theme, use Tada's CSS custom properties, such as
`--fg-color`, `--theme-color`, and `--tint-hue`. Tada's Sass modules are not
available to author styles.

## Output

Compiled files go in `_scripts/` in the output directory, mirroring their paths
in `src/`: `src/lectures/timezone.ts` becomes `_scripts/lectures/timezone.js`.
Imports shared by more than one script become chunks in `_scripts/chunks/`.
Development builds keep the names of the listed scripts and their
stylesheets, and include inline source maps. Production builds minify the
output and add a content hash to those names too, for example
`_scripts/lectures/timezone-18e7nj8b.js`. Chunks and other published files
always have a content hash in their names, in every build.

A content file that would write the same path as a compiled file fails the
build as an output conflict.

Each page lists its scripts twice. `<link rel="modulepreload">` elements in
`<head>` start downloading the modules early on a full page load.
`<link rel="modulepreload" data-tada-script>` elements at the end of the page
content tell the client runtime what to mount; they are swapped in with the
content on client-side navigation. The browser downloads each module once. Like
other generated links, their URLs include the site base path.

## Without JavaScript

Scripts are progressive enhancement. Pages render their content at build time,
and a page that needs a control only JavaScript can drive should render it
`hidden` or `disabled` and enable it from the mount function, with a
`<noscript>` fallback where useful. The starter content's Lectures page and
`src/lectures/timezone.ts` are an example.

## Watch mode

Watch mode watches `src/` and recompiles every listed script when any file in it
changes, including Sass partials and other imports. It also recompiles when a
page or the site config starts or stops listing a script, including one that
does not exist yet; edits elsewhere reuse the compiled scripts. After a failed
build, changes from it are retried with the next one, so a script error keeps
being reported until it is fixed. Pages are re-rendered
when the output files of a script they load change, such as a script that
starts importing a stylesheet.

## Inline and external `<script>` elements

Pages can still contain `<script>` elements in their content. These are not
compiled; see [Client-Side Navigation](client-side-navigation.md#author-scripts)
for how they run.
