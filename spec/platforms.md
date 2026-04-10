# Platform support

Tada runs on macOS, Linux, and Windows. All three platforms are listed in the
`os` field of `package.json`, and Bun is natively available on all three.

## Path handling

The build system works with three kinds of paths:

- Filesystem paths, which use the OS-native separator (`/` on macOS/Linux, `\`
  on Windows). These are produced by functions like `path.resolve()`,
  `path.relative()`, and `path.join()`. They are passed to `fs` APIs and
  `path.join(distDir, ...)`.

- Output paths, which always use forward slashes but are not URL-encoded. These
  are the keys of the build manifest, the `assetPath` field on rendered assets,
  and the entries in internal lookup sets (`validTargets`, `knownAssets`,
  `htmlAssetsByPath`). They correspond 1:1 to filesystem locations under
  `dist/`.

- URL paths, which always use forward slashes and are percent-encoded. These
  appear in generated HTML as `href`/`src` attribute values. Any character that
  is unsafe in a URL path (space, `?`, `#`, non-ASCII, etc.) is encoded.

Two helpers in `build/utils/paths.ts` cross these boundaries:

- `toPosix(p)` converts an OS-native path to POSIX form. Use it when a value
  from `path.relative()` or `path.join()` is about to enter an output-path
  context (asset paths, manifest keys, internal lookup sets).

- `toUrlPath(p)` converts an OS-native path to a URL path by running `toPosix`
  and then percent-encoding each segment. Use it when a filesystem-derived path
  is about to be emitted directly as an `href` or used as a URL lookup key.

`normalizeOutputPath()` calls `toPosix()` internally, so callers of
`normalizeOutputPath()` do not need to convert beforehand.

For operations that are purely about URL paths (resolving links, normalizing
routes), use `path.posix` methods directly.

## URL encoding and link validation

markdown-it percent-encodes link hrefs during parsing (for example,
`[x](</my notes.md>)` becomes `/my%20notes.md` in the token). Internal lookup
sets like `validTargets` store raw filesystem-derived paths (for example,
`/my notes.md`), so code that looks up an incoming href against one of these
sets must first decode the href. Both `validate-internal-links-plugin.ts` and
`reachability.ts` follow this convention. Filenames may contain spaces,
non-ASCII characters, or other URL-unsafe characters; they are written to
`dist/` with the raw filename and referenced in HTML with a percent-encoded
form.

Markdown link destinations that contain spaces must be wrapped in angle
brackets (`[x](</my notes.md>)`) or written with a percent-encoded space
(`[x](/my%20notes.md)`), per the CommonMark spec.

## Developing Tada

Developing Tada itself (running tests, linting, Git hooks) requires a Unix-like
environment (macOS or Linux). Several npm scripts, the Husky pre-commit hook, and
the functional test harness use shell syntax that is not available on Windows
outside of WSL.
