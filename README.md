# Tada :tada:

A static site generator. The successor to Presto.

## Features

- Modern design (light & dark following system, floating header, styled lists)
- Clickable/linkable landmarks (headings, deflists, alert boxes)
- Dynamic table of contents
  * Floats on the side of the screen when window is large enough
  * Renders headings, alert boxes, and `<hr>` elements
  * Highlights the heading currently being viewed
- Built-in search powered by [Pagefind][pagefind]
  * Only pages reachable by links on the site appear in search results
- Generated HTML pages for source code
  * Automatic code highlighting, clickable line numbers
  * Dynamic table of contents for each method/function
  * Converts new Markdown comment syntax ([added in Java 23][jep467]) to HTML
  * Indexed by Pagefind
- PDF files are copied into `dist/`
  - Text of each PDF page is extracted using [mutool][mutool] and indexed
- External link handling (special visual treatment for external links)
- Internal link validation at build time (broken links fail the build)
- Internal links automatically prefixed with base path, if specified
- Time zone chooser (automatically adjusts `<datetime>` elements)
- Extended Markdown syntax
  * `<<< details ... <<<` renders a collapsible box
  * `::: section ... :::` renders a special section with a fancy background
  * `!!! note ... !!!` and `!!! warning ... !!!` render alert boxes
  * `??? review ... ???` renders a Q & A section; answers hidden until click
  * Special heading subtitles with `## Heading # A subtitle here`
- Automatically generated favicon
  * Text, color, font and font weight taken from config file


## Installation

Install [Bun](https://bun.sh/), then install Tada globally:

```
bun add -g @abreen/tada
```


## Quick start

Create a new site:

```
tada init mysite
```

This will ask you a few questions (site title, logo symbol, theme color, etc.)
and create a new directory with everything you need.

Then build and preview your site:

```
cd mysite
tada dev
tada serve
```

Visit [http://localhost:8080/index.html](http://localhost:8080/index.html).


## CLI commands

### `tada init <dirname>`

Create a new Tada site in a new directory. Prompts for:
- **Site title** --- displayed in the header and `<title>` tag
- **Symbol** --- short text (1-5 uppercase characters) shown in the logo and favicon
- **Theme color** --- HSL color, e.g. `hsl(195 70% 40%)`
- **Default time zone** --- for `<datetime>` elements (defaults to your system zone)
- **Production base URL** --- e.g. `https://example.edu`
- **Production base path** --- e.g. `/cs101` (defaults to `/`)

Pass `--default` to use the default values for all options without being
prompted.


### `tada dev`

Build the site for local development (using `config/site.dev.json`)
into the `dist/` directory.


### `tada serve`

Start a development web server at `http://localhost:8080` which serves the
files in the `dist/` directory.


### `tada watch`

Start a development web server, watch for changes and rebuild automatically.


### `tada clean`

Remove the `dist/` directory.


### `tada prod`

Build the site for production (uses `config/site.prod.json`).


## Prerequisites

- [Bun](https://bun.sh/)
- [MuPDF](https://mupdf.com/) (optional, for PDF text extraction in search)
  - On macOS: `brew install mupdf-tools`
  - On Fedora: `dnf install mupdf`

> You may skip MuPDF if you don't need search results to include links to PDF
> pages. You can also turn off `features.search` in the config to disable
> search entirely.


## Configuration

Build-time site config lives in:

- `config/site.dev.json` (used by `tada dev` / `tada watch`)
- `config/site.prod.json` (used by `tada prod`)
- `config/_theme.scss` (contains CSS custom property definitions used in styles)
- `config/nav.json` (navigation structure)
- `config/authors.json` (author data)

Example site configuration JSON file:

```json
{
  "title": "Intro to Computer Science",
  "symbol": "CS 0",
  "features": { "search": true, "code": true, "favicon": true },
  "base": "https://example.edu",
  "basePath": "/cs0",
  "internalDomains": ["example.edu"],
  "defaultTimeZone": "America/New_York",
  "codeLanguages": { "java": "java", "py": "python" },
  "faviconColor": "hsl(351 70% 40%)",
  "faviconFont": "Inter",
  "faviconFontWeight": 700,
  "vars": {
    "staffEmail": "staff@example.edu"
  }
}
```

| Field | Description |
|-------|-------------|
| `title` | Site title displayed in the header and used to derive `<title>` postfix |
| `symbol` | Short text (1-5 chars) displayed in the logo and used as the favicon symbol |
| `features.search` | Enable search UI and Pagefind index generation |
| `features.code` | Enable generated source-code HTML pages for configured code extensions |
| `features.favicon` | Enable automatically generated favicons |
| `base` | Full base URL of the deployed site, used for metadata and URL generation |
| `basePath` | URL prefix for deployment under a subpath (e.g., `"/cs101"`), use `"/"` at root |
| `internalDomains` | Domain names treated as internal by link processing (not marked external) |
| `codeLanguages` | Map file extension to Shiki language (e.g., `"java": "java"`) |
| `faviconColor` | HSL color used by favicon generation, e.g. `"hsl(195 70% 40%)"` |
| `faviconFontWeight` | Font weight used for favicon text (e.g., `700`) |
| `vars` | Arbitrary key/value variables exposed to templates/content (e.g., `<%= staffEmail %>`) |

You can also set `titlePostfix` and `faviconSymbol` explicitly to override the
values derived from `title` and `symbol`.


#### `nav.json`

Defines the site navigation structure. The file contains an array of section
objects. Each section contains an array of link objects (internal or external,
and whether the link is disabled). You should specify at least two sections,
but three or more sections are supported.

```json
[
  {
    "title": "Navigation",
    "links": [{ "text": "Home", "internal": "/index.html" }]
  },
  {
    "title": "Topics",
    "links": [
      { "text": "Lectures", "internal": "/lectures/index.html" },
      {
        "text": "Problem Sets",
        "internal": "/problem_sets/index.html",
        "disabled": true
      }
    ]
  },
  {
    "title": "Links",
    "links": [
      { "text": "Zoom", "external": "https://zoom.com" }
    ]
  }
]
```


#### `authors.json`

Maps author handles (used in front matter `author` fields) to display names
and avatars. Each key is a handle (e.g., `jsmith`) and each value is an object
with `name`, `avatar`, and optionally `url`.

```json
{
  "jsmith": { "name": "Jane Smith", "avatar": "/avatars/jsmith.jpg" },
  "ajones": {
    "name": "Alex Jones",
    "avatar": "/avatars/ajones.jpg",
    "url": "/staff/ajones.html"
  }
}
```


### Log level

Set the `TADA_LOG_LEVEL` environment variable to control build log verbosity.
Valid levels (from most to least verbose): `debug`, `info`, `warn`, `error`.
The default level is `info`. To see *all* logs generated by Tada, set the env
var to `debug`:

```
TADA_LOG_LEVEL=debug tada dev
```


## Content

Site content lives in the `content/` directory. Markdown is converted to HTML.
HTML files should contain front matter and are also built, but not processed
like Markdown files are.

PDF, `.txt`, ZIP, images, and other kinds of files are copied into `dist/`
in the same locations. All files in `public/` are copied directly into `dist/`
with zero processing.


### Front matter fields

Each file in `content/` should start with "front matter" (a YAML-formatted
list of variables parsed using the [`front-matter`][front-matter] library).

| Field | Description |
|-------|-------------|
| `title` (required) | Page title (`<title>` tag and page heading) |
| `skip` | Set to `true` to skip building this page completely |
| `author` | Author handle (e.g. `jsmith`) resolved to a full object via `config/authors.json` |
| `description` | Meta description for the page |
| `toc` | Set to `true` to show a table of contents |
| `parent` & `parentLabel` | URL and label for a breadcrumb link displayed above the title |
| `published` | Year, month, and day of publishing (e.g, `2025-09-09`) |


### Variable substitution

Plain text content (e.g., HTML and Markdown) are processed using [Lodash
templates][lodash].

- Site config values are available under `site` (e.g., `site.title`, `site.symbol`)
- Page variables (from front matter) are available under `page` (e.g., `page.author`)
- Custom variables from the `"vars"` property of the config are available
  without any prefix (e.g., `<%= staffEmail %>`)


## Templates

HTML page layouts are internal to the Tada package. You don't need to modify
them; they are designed to work with the client-side components and styles
bundled in the package.



[inter]: https://fonts.google.com/specimen/Inter
[lodash]: https://lodash.info/doc/template
[front-matter]: https://www.npmjs.com/package/front-matter
[pagefind]: https://pagefind.app/
[mutool]: https://mupdf.readthedocs.io/en/latest/tools/mutool.html
[jep467]: https://openjdk.org/jeps/467
