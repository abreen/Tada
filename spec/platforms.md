# Platform support

Tada runs on macOS, Linux, and Windows. All three platforms are listed in the
`os` field of `package.json`, and Bun is natively available on all three.

## Path handling

The build system works with two kinds of paths:

- Filesystem paths, which use the OS-native separator (`/` on macOS/Linux, `\`
  on Windows). These are produced by functions like `path.resolve()`,
  `path.relative()`, and `path.join()`.

- Output paths and URL paths, which always use forward slashes. These appear in
  generated HTML, the build manifest, search indexes, and anywhere a path
  identifies a web resource.

The `toPosix()` function in `build/utils/paths.ts` converts a filesystem path to
a POSIX path by replacing the OS-native separator with `/`. Use it any time a
value from `path.relative()` or `path.join()` is about to enter a URL or output
path context. The `normalizeOutputPath()` function in the same file calls
`toPosix()` internally, so callers of `normalizeOutputPath()` do not need to
convert beforehand.

For operations that are purely about URL paths (resolving links, normalizing
routes), use `path.posix` methods directly.

## Developing Tada

Developing Tada itself (running tests, linting, Git hooks) requires a Unix-like
environment (macOS or Linux). Several npm scripts, the Husky pre-commit hook, and
the functional test harness use shell syntax that is not available on Windows
outside of WSL.
