# Header logo

The optional top-level `logo` string replaces the header's text `symbol` with an
image rendered at build time. Navigation works with JavaScript disabled. The
image is decorative (`alt=""`, `aria-hidden="true"`); the navigation summary
retains its accessible name, “Toggle site navigation”.

```yaml
logo: branding/logo.svg
favicon: branding/favicon.ico
symbol: TADA
```

Paths are relative to `public/`. Nested directories and spaces are supported,
and URLs encode each path segment and respect `basePath`. Absolute paths,
backslashes, empty segments, `.` and `..` segments, queries, and fragments are
rejected. Assets must exist and be readable. Logo formats are not restricted or
converted; choose a browser-supported image format.

Image logos have a 24px height, automatic width, a 96px maximum width, and
`object-fit: contain`. They retain the symbol's spacing and pointer behavior,
without its badge padding or background. With no logo, the symbol remains;
with neither, the header shows the title and menu icon alone.

`logo` and `favicon` are independent. Generated favicons continue to use
`faviconSymbol` or `symbol`, never the logo image. Starter configurations and
initialization options do not change. Watch builds retain the last successful
output when an asset is missing or unreadable, and recover when it is restored.
