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
public directory. The normal mode copies starter content, navigation, and author
data from the package. The starter content includes an example of author
JavaScript: the Lectures page loads `public/timezone.js`, which lets visitors
convert the page's `<time>` elements to another time zone and remembers the
choice in local storage. Without JavaScript, the chooser stays hidden and the
authored times show with a `<noscript>` note. Bare-mode config files also start with
`extensionToShikiLanguage: {}` and `shikiLanguages: []`, so source-code pages
and Markdown fence highlighting remain opt-in.

The generated config files include `site.dev.yaml` (pointing at localhost) and
`site.prod.yaml` (using the provided production URL). Internal domains are
automatically extracted from the production base URL. Both site configs
explicitly include `defaultFont: sans` and `defaultContrast: standard` so their
initial appearance is easy to discover and change. Starter nav and author data
files are also generated as YAML by default.
