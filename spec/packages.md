# Packages

A site can use files from npm packages installed in its `node_modules`, such as
a web font package or a small package that wraps a frontend library for Tada.
Tada never installs packages; run `bun install` (or another package manager)
in the site directory. Sites created by `tada init` already have a
`package.json`.

## `npm:` paths

A value that starts with `npm:` names a package, optionally followed by a path
inside it:

```yaml
logo: npm:course-brand/logo.svg
fontOverrides:
  serif:
    regular: npm:@fontsource/literata/files/literata-latin-400-normal.woff2
scripts: [npm:tada-leaflet]
```

The package name is a lowercase npm name, scoped (`@scope/name`) or not. The
path inside it follows the same rules as public paths: POSIX separators, no
empty, `.`, or `..` segments, and no backslashes, queries, or fragments. Values
without the prefix keep their usual meaning, so a script named `chart.js` in
`src/` is never confused with the `chart.js` package.

Packages are found the way Node finds them: in `node_modules` in the site
directory, or in the nearest parent directory that has one. A package that is
not installed fails the build, for example
`logo "npm:course-brand/logo.svg" needs package "course-brand", which is not installed; run bun install`.

## Files in config

`logo`, `favicon`, and each `fontOverrides` face accept an `npm:` path to a
file in a package. The file is found by its path in the package directory,
ignoring the package's `exports` field, which often leaves out files such as
fonts. It is validated like a file in `public/` (fonts must be WOFF2 files with
every requested feature) and published unchanged at
`_packages/<name>/<path>`, for example
`_packages/@fontsource/literata/files/literata-latin-400-normal.woff2`. URLs
encode each path segment and include the site base path. A missing file fails
the build, for example
`fontOverrides.serif.regular "npm:@fontsource/literata/files/x.woff2" does not exist in package "@fontsource/literata"`,
as does a file whose real path is outside the package, such as through a
symbolic link.

Only files that config values name are copied; nothing else in
`node_modules` is published as-is. A content or public file that would write the same output
path fails the build as an output conflict.

## Scripts and stylesheets

Site config and front matter `scripts` accept `npm:` paths to package modules,
such as `npm:tada-leaflet` or `npm:tada-leaflet/heatmap`, which are compiled
with the site's own scripts; see
[Author Scripts](author-scripts.md#using-packages). Scripts in `src/` can also
import packages by name, and their Sass stylesheets can load package files with
`pkg:` URLs. A package's stylesheets can refer to the package's own images,
which are published in `_scripts/assets/`.

## Watch mode

Watch mode does not watch `node_modules`. Restart `tada dev` after installing
or upgrading a package. Editing a config value that names a package rebuilds
the site as usual.
