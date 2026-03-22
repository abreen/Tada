# Templates

Tada uses Lodash HTML templates to wrap page content.

**Templates are internal to the package and not edited by site authors.**

## Page templates

- **default** -- standard page layout for Markdown and HTML content
- **code** -- source code page with line numbers and TOC
- **literate** -- literate Java page with execution output

## Partials

Templates are composed from partials for the header, navigation, page heading,
author byline, download button, and footer.

## Template variables

Templates can access:

- **page.\*** -- front matter fields (title, author, description, published, etc.)
- **site.\*** -- all site config values
- **content** -- the rendered page body
- **isHomePage** -- true when rendering the home page

Utility functions are available for formatting dates, applying the base path to
URLs, rendering other templates, loading JSON data files, generating CSS class
strings, and rendering the time zone chooser.

Site config values under `vars` are accessible as template variables, and both
`nav.json` and `authors.json` support template interpolation using these values.
