# Examples

Small Tada sites that each show one feature. They are not part of the npm
package.

- [`leaflet/`](leaflet): a page lists a package that wraps
  [Leaflet](https://leafletjs.com) in its `scripts`, as `npm:tada-leaflet`.
  The package is in `leaflet/tada-leaflet/`.
- [`custom-font/`](custom-font): the site config sets the serif font to
  Literata from the `@fontsource/literata` package.
- [`custom-sass/`](custom-sass): the site config lists a script in `src/`
  that imports a Sass stylesheet, which styles every page.
- [`document-index/`](document-index): `content/handbook/index.yml` orders
  the handbook's pages into a tree, which gives them a sidebar, breadcrumbs,
  and previous and next links.

To run one, from its directory (`bun install` is needed only when it has a
`package.json`):

```
bun install
../../bin/tada.ts dev
../../bin/tada.ts serve
```

Then open http://localhost:8080.
