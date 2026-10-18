# Custom Elements

A script can come with a renderer: a module that Tada runs at build time to
fill custom elements on the pages that list the script. Pages then include the
script's HTML before any JavaScript runs, so a control takes up its space on
the first paint and still shows with JavaScript turned off. The script enhances
the rendered HTML in the browser with its mount function, as usual (see
[Author Scripts](author-scripts.md)).

## Writing a renderer

A renderer sits next to its script, with `.render.ts` or `.render.js` in place
of the script's extension: `src/lectures/timezone.ts` has the renderer
`src/lectures/timezone.render.ts`. Pages and the site config list only the
script; a page that lists a script, or loads it as a site-wide script, uses
its renderer too. Listing a renderer in `scripts` fails the build, for example
`content/x.md: scripts[0] "lectures/timezone.render.ts" is a renderer, which runs at build time; list the script it belongs to instead`,
as does a script with both a `.render.ts` and a `.render.js` file.

A renderer's default export maps custom element names to render functions:

```ts
import type { Renderers } from '@abreen/tada';

const renderers: Renderers = {
  'tz-chooser': ({ attributes }) =>
    `<label>Show times in <select disabled>...</select></label>`,
};
export default renderers;
```

A page uses the element in its content:

```md
<tz-chooser>
</tz-chooser>
```

Element names must be valid custom element names made of ASCII characters:
a lowercase letter first, at least one hyphen, and only lowercase letters,
digits, `.`, `_`, and `-`, such as `tz-chooser`. The names the HTML standard
reserves, such as `font-face`, are not allowed. One renderer can render
several elements.

## Rendering

Tada renders each page's content, from Markdown or HTML, and then fills every
element that a renderer of the page's scripts names. The render function's
return value replaces the element's content; the start tag, with its
attributes, and the end tag stay as written. Elements stay in the published
page, so the script can find them, such as with
`document.querySelector('tz-chooser select')`.

A render function receives a `RenderInfo`:

- `attributes`: the element's attributes, with lowercase names and decoded
  values
- `html`: the element's content as written, after Markdown
- `page.path`: the page's URL path without the base path, such as
  `/lectures/index.html`
- `page.frontMatter`: the page's front matter, after
  [site variables](variables.md) are substituted
- `vars`: the site config's `vars`

It must return a string of HTML synchronously. Render output is part of the
page content: internal links in it get the base path and are checked like any
other link (see [Link Processing](link-processing.md)), and
[details previews](details.md) apply to it. Site variables in it are not
substituted; use `vars` instead. Headings in it are not listed in the table of
contents.

Only the outermost elements are rendered. An element inside a rendered element
is passed to the outer render function in `html`, as written, and render output
is not rendered again. Elements in `<template>` contents, in `<noscript>`, and
in SVG or MathML are left alone, as are custom elements that no renderer of the
page's scripts names, which publish unchanged.

Every rendered element needs an end tag. The HTML parser closes a custom
element without one wherever the content around it ends, so Tada fails the
build instead, for example
`content/x.md: <tz-chooser> needs a closing tag </tz-chooser>`.

In Markdown, a custom element is an HTML block only when its start tag is
alone on its line, followed by a blank line after the end tag, as in the
example above. Written inline, such as `<tz-chooser></tz-chooser>` inside a
sentence or on a line of its own with nothing between the tags, it is part of
a paragraph, so its render output must be phrasing content such as a `<span>`
rather than a `<div>` or `<p>`.

Code pages have no authored content, so nothing on them is rendered.

## Packages

A package script can have a renderer too. The package names it in the `tada`
field of its `package.json`, keyed like the `npm:` path, with `.` for the main
module:

```json
{
  "tada": {
    "render": {
      ".": "./render.js",
      "./heatmap": "./heatmap-render.js"
    }
  }
}
```

Paths are relative to the package directory and end in `.ts` or `.js`. A
renderer that does not exist fails the build, for example
`script "npm:tada-map" renderer "./render.js" does not exist in package "tada-map"`,
as does one whose real path is outside the package or a malformed `tada.render`
field. A package without the field has no renderers.

## Compiling and loading

Tada compiles each renderer and everything it imports into one module for Bun,
using the same import rules as scripts: relative imports in a file in `src/`
must stay in `src/`, and packages are imported by name. Stylesheets that shared
modules import are ignored, so a renderer and its script can share code. A
renderer can use top-level `await`, such as to load data once per build.

Bun imports modules only from files, so each compiled renderer is written to a
new temporary directory, imported, and the directory removed. Nothing is written
to `src/` or the output directory, and renderers are never published. Since
each build imports from new paths, watch mode always runs the latest code.

## Errors

Each of these fails the build:

- A renderer that fails to compile names its file, line, and column, like a
  script.
- A renderer that throws while loading:
  `src/lectures/timezone.render.ts: failed to load: <message>`.
- A default export that is not an object of render functions, or a name that
  is not a valid custom element name, names the renderer.
- Two scripts of one page that render the same element:
  `content/x.md: <tz-chooser> is rendered by both "a.ts" and "npm:b"`.
- A render function that throws:
  `content/x.md: <tz-chooser> render failed (src/lectures/timezone.render.ts): <message>`.
- A render function that returns something other than a string. A Promise
  has its own message, since render functions can't be async.

## Watch mode

Renderers are compiled whenever scripts are (see
[Author Scripts](author-scripts.md#watch-mode)): after any change in `src/`,
or when pages or the site config list different scripts. A compiled
renderer's name includes a hash of its code, so pages that load a script are
re-rendered when its renderer's code changes, including code it imports, or
when the renderer is added or removed. Watch mode does not watch
`node_modules`; restart `tada dev` after changing a package's renderer.

## Without JavaScript

Render output is ordinary HTML in the published page. A control that only
JavaScript can drive should still render `disabled`, and the script enables it
when it mounts. The starter content's Lectures page and
`src/lectures/timezone.render.ts` are an example (see
[Site Initialization](site-init.md)).
