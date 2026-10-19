# Site Initialization

Tada can create a new site in a named directory. The directory must not already
exist. The command prompts for:

- Site title
- Logo symbol (1 to 5 uppercase characters, digits, hyphens, or spaces, or a
  single emoji)
- Theme color (any CSS color format)
- Background tint hue (0 to 360 degrees) and amount (0 to 100%)
- Production base URL and base path

Default answers are provided for all prompts; the defaults are the title
"Tada", the symbol 🎉, the theme color `darkturquoise`, and the tint hue 190. Both generated configs turn on `features.favicon`
when the symbol is text. Generated favicons cannot draw emoji, so an emoji
symbol sets `features.favicon: false` in both configs instead. Non-interactive mode skips prompts
and uses defaults or values provided as arguments.

A bare mode creates a minimal site with just a single home page and an empty
public directory. It writes no nav file, so the header links the logo and site
title to the home page (see
[Without a nav file](navigation.md#without-a-nav-file)). The normal mode copies starter content, navigation, and author
data from the package. The starter content includes an example of an
author script: the Lectures page lists `src/lectures/timezone.ts` in its
`scripts` front matter (see [Author Scripts](author-scripts.md)). It lets
visitors convert the page's `<time>` elements to another time zone and
remembers the choice in local storage, and it imports
`src/lectures/timezone.scss` for its styles. Its renderer,
`src/lectures/timezone.render.ts`, writes the chooser into the page's
`<tz-chooser>` element at build time (see [Custom Elements](custom-elements.md)),
sharing the list of time zones in `src/lectures/time-zones.ts` with the script.
Without JavaScript, the chooser shows the default zone, disabled, and the
authored times show with a `<noscript>` note. The Labs and
Lectures sections each have an `index.yml` that orders their pages as a
[document index](document-index.md). Bare-mode config files also start with
`extensionToShikiLanguage: {}` and `shikiLanguages: []`, so source-code pages
and Markdown fence highlighting remain opt-in.

The generated config files include `site.dev.yaml` (pointing at localhost) and
`site.prod.yaml` (using the provided production URL). Internal domains are
automatically extracted from the production base URL. Both site configs
explicitly include `defaultFont: sans` and `defaultContrast: standard` so their
initial appearance is easy to discover and change. The normal mode also generates
starter nav and author data files as YAML by default. In normal mode, `site.dev.yaml`
also lists names from the starter content, such as `Tada` and `superlink`, in
`proofread.words`, so [proofreading](proofread.md) does not underline them;
bare mode and `site.prod.yaml` have no `proofread` key.

The normal mode also writes a `package.json` that is private and lists the current
Tada version of `@abreen/tada` in `devDependencies`, and a `tsconfig.json` that
covers `src/` with strict type checking. Running `bun install` lets editors
resolve `import type { Mount } from '@abreen/tada'`; builds don't need it. The
`tsconfig.json` turns off `noUncheckedSideEffectImports` because Tada, not
TypeScript, resolves imported `.scss` and `.css` files. Bare mode creates no
`src/` directory, `package.json`, or `tsconfig.json`, because TypeScript reports
an error for a `tsconfig.json` with no files to check.
