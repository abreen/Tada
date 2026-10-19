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
or `..` segments, backslashes, `?`, or `#`, or an `npm:` path naming a module of
an installed package (see [Using packages](#using-packages)). Paths starting
with `_npm~` are reserved for packages. A malformed path or one that names
no file in `src/` fails the build. Errors name the page, for example
`content/lectures/index.md: script "lectures/timezon.ts" not found in src/`; a
site-wide script error names its index in the config `scripts` list. A script
that fails to compile fails the build with its file, line, column, and reason.

Only listed scripts and their imports are compiled. Other files in `src/` are
ignored. Imports can be relative files in `src/`, or packages installed in
`node_modules`, imported by name, such as `import * as d3 from 'd3'`; Tada does
not install packages. A relative import in a file in `src/` that leads outside
`src/`
fails the build, for example
`src/lectures/clock.ts: "../../content/data.json" is outside src/`, since watch
mode would not notice changes to it. `src/` and directories in it may be symbolic links, but a listed
script's real path must be inside `src/`: Bun names compiled files by real
paths, which depending on its version can lead outside `_scripts/`, so a script
reached through a link to a directory outside `src/` fails the build before
compiling, for example `src/shared/clock.ts: its real path is outside src/`.

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
import, a default export that is not a function or is a class (such as a
library listed directly instead of a package that mounts it), a mount that
throws or
rejects, or a cleanup function that throws logs an error to the console, in
production builds as well as development builds. Errors name the script and
say whether mounting or cleaning up failed. The other scripts are not
affected.

Scripts mount after Tada's own page components. Each module starts loading at
once, in parallel, and mount functions are called in the order the page lists
them (site-wide scripts first), as each module loads. A mount function does not
wait for an earlier async mount to finish, but it does wait for earlier modules
to load. When the visitor leaves the page, cleanup runs in reverse order: the
last script mounted is cleaned up first, and every script is cleaned up before
Tada's own components. Site-wide scripts are mounted and cleaned up with each
page, like the page's own scripts; only top-level module code runs once per
visit. Navigation does not wait for scripts either: it
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

## Using packages

A page or the site config can list a module of an installed package with an
`npm:` path (see [Packages](packages.md)):

```yaml
scripts: [npm:tada-leaflet, npm:tada-leaflet/heatmap]
```

`npm:<name>` names the package's main module and `npm:<name>/<path>` one of
the modules it exports, resolved the way the bundler resolves
`import '<name>/<path>'` for browsers, honoring the package's `exports` field
and its `browser` conditions. The module is compiled with the site's scripts,
so modules that a package and a script in `src/` both import are shared. Its
default export is mounted like a script's; a module without one is loaded but
nothing is mounted. The package must be written for Tada: listing a library
such as a chart library directly calls its default export, often a class, as
a mount function, which fails (see [Writing a package](#writing-a-package)). A
package that is not installed fails the build, for example
`content/map.md: script "npm:tada-leaflet" needs package "tada-leaflet", which is not installed; run bun install`,
as does a path the package does not export, for example
`script "npm:tada-leaflet/heatmap" is not exported by package "tada-leaflet"`.
Tada compiles each package script from a module it generates at
`src/_npm~<name>.js` (with `/` replaced by `~`), which exists only in memory;
a file in `src/` at that path fails the build. Watch mode does not watch
`node_modules`; restart `tada dev` after installing or upgrading a package.

### Writing a package

A package that wraps a frontend library for Tada sites, such as a map or chart
library, default-exports a `Mount` from its main module and depends on the
library. It lists `@abreen/tada` in `peerDependencies` (and
`devDependencies`) for the `Mount` type, imported with `import type`. Sites
install it and list it in their site config or front matter.

A site-wide package script runs on every page, so it should find the elements
it enhances first and load a large library only when the page has any, with a
dynamic `import()`; Tada compiles the library into a separate chunk that only
those pages download. As with any script, the page's content should be useful
without JavaScript. A package can add build-time fallback content, such as a
static image or a link in place of a map, with a renderer that its
`package.json` names (see [Custom Elements](custom-elements.md#packages)), or
the page can provide it.

A package's stylesheets can refer to its images with relative `url()` paths,
which are published in `_scripts/assets/` with content hashes in their names.
Libraries that find their images by URL at run time, such as Leaflet's default
marker icons, need those URLs set by the package script.

## Renderers

A script can have a renderer next to it, such as
`src/lectures/timezone.render.ts`, which Tada runs at build time to fill custom
elements like `<tz-chooser></tz-chooser>` on the pages that list the script.
See [Custom Elements](custom-elements.md).

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
`src/` and in installed packages (files in a `node_modules` directory where
packages are found, other than the site's own files); a path that leads
anywhere else outside `src/` fails the build. Sass loads files from packages with `pkg:` URLs, such as
`@use 'pkg:some-package/colors'`, which Sass resolves from the site directory.
A package's own stylesheets, imported by a script, can load and refer to any of
the package's files.

A stylesheet can reference files in `src/`, such as fonts and images, with
relative `url()` paths. They resolve from the stylesheet a script imports; as
usual with Sass, paths in partials are not rewritten, so write them relative to
the file that uses the partial. Each file is published unchanged in
`_scripts/assets/`, with a content hash in its name, or inlined as a data URL
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
A package script is named for its `npm:` path, with `/` replaced by `~`:
`npm:@scope/name/path` becomes `_scripts/_npm~@scope~name~path.js`.
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
`<noscript>` fallback where useful. A script's renderer can write that control
into the page at build time, so it takes up its space before the script runs
(see [Custom Elements](custom-elements.md)). The starter content's Lectures
page, `src/lectures/timezone.ts`, and `src/lectures/timezone.render.ts` are an
example.

## Watch mode

Watch mode watches `src/` and recompiles every listed script when any file in it
changes, including Sass partials and other imports. It also recompiles when a
page or the site config starts or stops listing a script, including one that
does not exist yet; edits elsewhere reuse the compiled scripts. After a failed
build, changes from it are retried with the next one, so a script error keeps
being reported until it is fixed. Pages are re-rendered
when the output files of a script they load change, such as a script that
starts importing a stylesheet, or on every recompile when it has a renderer (see
[Custom Elements](custom-elements.md#watch-mode)).

## Inline and external `<script>` elements

Pages can still contain `<script>` elements in their content. These are not
compiled; see [Client-Side Navigation](client-side-navigation.md#author-scripts)
for how they run.
