# Site Initialization

Tada can create a new site in a named directory. The directory must not already
exist. The command prompts for:

- Site title
- Logo symbol (1 to 5 uppercase characters, digits, hyphens, or spaces, or a
  single emoji)
- Theme color (any CSS color format)
- Background tint hue (0 to 360 degrees) and amount (0 to 100%)
- Default time zone (one of the zones in `src/timezone/timezones.json`)
- Production base URL and base path

Default answers are provided for all prompts; the defaults are the title
"Tada" and the symbol 🎉. Both generated configs turn on `features.favicon`
when the symbol is text. Generated favicons cannot draw emoji, so an emoji
symbol sets `features.favicon: false` in both configs instead. Non-interactive mode skips prompts
and uses defaults or values provided as arguments.

The time zone must be one of the zones listed in `src/timezone/timezones.json`,
the same list that builds accept for `defaultTimeZone`. The prompt re-asks and
the `--default-time-zone` flag fails for any other value. The default is the
system time zone when it is in that list; otherwise init uses `UTC` and prints a
one-line note such as
`System time zone Europe/Berlin is not supported; using UTC`.

A bare mode creates a minimal site with just a single home page and an empty
public directory. The normal mode copies starter content, navigation, and author
data from the package. Bare-mode config files also start with
`extensionToShikiLanguage: {}` and `shikiLanguages: []`, so source-code pages
and Markdown fence highlighting remain opt-in.

The generated config files include `site.dev.yaml` (pointing at localhost) and
`site.prod.yaml` (using the provided production URL). Internal domains are
automatically extracted from the production base URL. Both site configs
explicitly include `defaultFont: sans` and `defaultContrast: standard` so their
initial appearance is easy to discover and change. Starter nav and author data
files are also generated as YAML by default.
