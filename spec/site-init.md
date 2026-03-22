# Site Initialization

Tada can create a new site in a named directory. The directory must not already
exist. The command prompts for:

- Site title
- Logo symbol (1--5 uppercase characters, digits, hyphens, or spaces)
- Theme color (any CSS color format)
- Background tint hue (0--360 degrees) and amount (0--100%)
- Default time zone (IANA identifier)
- Production base URL and base path

Default answers are provided for all prompts. Non-interactive mode skips prompts
and uses defaults or values provided as arguments.

A bare mode creates a minimal site with just a single home page and an empty
public directory. The normal mode copies starter content, navigation, and author
data from the package.

The generated config files include `site.dev.json` (pointing at localhost) and
`site.prod.json` (using the provided production URL). Internal domains are
automatically extracted from the production base URL.
