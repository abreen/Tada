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

## Emoji symbol

`symbol` may be one emoji instead of uppercase text, such as `symbol: "🚀"`.
Flags, keycaps, skin tones, and ZWJ sequences each count as one emoji; text
mixed with an emoji, or more than one emoji, fails validation. The site schema
and `tada init` share the pattern in `build/utils/symbol.ts`.

An emoji symbol is the logo itself: it renders with class `logo logo-emoji`,
without the badge padding or theme-color background, in the system emoji font at
roughly the 24px height of an image logo. Detection happens at build time, so
it works without JavaScript.

Generated favicons stay text: `faviconSymbol` accepts only uppercase text, and
it is not derived from an emoji `symbol`. When favicons are generated (the
feature is on and no custom `favicon` is set), an emoji `symbol` without
`faviconSymbol` fails validation with a message naming `faviconSymbol`. `tada
init` still asks for a text symbol.

```yaml
symbol: "🚀"
faviconSymbol: CS 0
```

`logo` and `favicon` are independent. Generated favicons continue to use
`faviconSymbol` or `symbol`, never the logo image. Starter configurations and
initialization options do not change. Watch builds retain the last successful
output when an asset is missing or unreadable, and recover when it is restored.
