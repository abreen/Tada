# Custom Elements

A script can come with a renderer: a module that Tada runs at build time to
fill custom elements on the pages that list the script. Pages then include the
script's HTML before any JavaScript runs, so a control takes up its space on
the first paint and still shows with JavaScript turned off. The script enhances
the rendered HTML in the browser, either with its mount function, as usual (see
[Author Scripts](author-scripts.md)), or by defining the element with
`customElements.define` (see
[In the browser](#in-the-browser)).

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
`content/x.md: <tz-chooser> needs a closing tag </tz-chooser>`. The parser
also closes an element itself when content in it, such as a `<div>`, closes
the paragraph around it, and then ignores the end tag as written; Tada finds
that end tag by matching start and end tags with the element's name, and the
element's content is everything between them as written.

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

## Loading

Tada imports each renderer into the build's own process, while the scripts
compile. Code that finds files relative to its module, such as with
`import.meta.dir`, `import.meta.url`, or `__dirname`, finds them next to the
source file, and packages load from `node_modules` as usual. Stylesheets that
shared modules import are ignored, so a renderer and its script can share
code. A renderer can use top-level `await`, such as to load data once per
build. Renderers are never published.

The render functions on each page get their own copy of `page` and `vars`, so
changing them has no effect on other pages.

## Errors

Each of these fails the build:

- A renderer that fails to load, including a syntax error:
  `src/lectures/timezone.render.ts: failed to load: <message>`.
- A default export that is not an object of render functions, or a name that
  is not a valid custom element name, names the renderer.
- Two scripts of one page that render the same element:
  `content/x.md: <tz-chooser> is rendered by both "a.ts" and "npm:b"`.
- A render function that throws:
  `content/x.md: <tz-chooser> render failed (src/lectures/timezone.render.ts): <message>`.
- A render function that returns something other than a string, with the same
  start, such as
  `content/x.md: <tz-chooser> render failed (src/lectures/timezone.render.ts): must return a string, got number`.
  A Promise has its own message, since render functions can't be async.

## Watch mode

Renderers are imported again whenever scripts are compiled (see
[Author Scripts](author-scripts.md#watch-mode)): after any change in `src/`,
or when pages or the site config list different scripts. Before importing,
Tada forgets every module in `src/` that Bun has loaded, so renderers and
everything they import from `src/` run their latest code. A renderer can read
files when it loads, so every page that loads a script with a renderer, or one
whose renderer was removed, is re-rendered each time, even if the renderer's
code did not change. Files outside `src/` that a renderer reads are not
watched, and neither is `node_modules`; restart `tada dev` after changing a
package's renderer.

## In the browser

A script can define the element it renders with `customElements.define`, at
the top level of its module. The browser then upgrades each element in the
rendered HTML, and its `connectedCallback` and `disconnectedCallback` run each
time the element is added to or removed from the page. State kept in module
variables lasts for the whole visit, across client-side navigations.

On a client-side navigation, Tada loads the new page's scripts before swapping
in its content (see
[Client-Side Navigation](client-side-navigation.md#author-scripts)), so a
script's elements are upgraded as the content is inserted, before the view
transition captures the new page. A control defined this way shows the
visitor's state from the start, rather than the build-time default it would
show until a mount function runs. On a full page load, elements are upgraded
when the script loads, after the page is shown.

## Without JavaScript

Render output is ordinary HTML in the published page. A control that only
JavaScript can drive should still render `disabled`, and the script enables it
when it mounts or when the element connects. The starter content's Lectures
page, `src/lectures/timezone.render.ts`, and `src/lectures/timezone.ts`, which
defines `<tz-chooser>`, are an example (see
[Site Initialization](site-init.md)).
