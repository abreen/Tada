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
  * Only pages in `content/` reachable from `/index.html` are indexed
- Generated HTML pages for source code
  * Automatic code highlighting, clickable line numbers
  * Dynamic table of contents for each method/function
  * Converts new Markdown comment syntax ([added in Java 23][jep467]) to HTML
  * Indexed by Pagefind (classes, interfaces, methods, and fields)
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
- **Site title**: displayed in the header and `<title>` tag
- **Symbol**: short text (1-5 uppercase characters) shown in the logo and favicon
- **Theme color**: HSL color, e.g. `hsl(195 70% 40%)`
- **Background tint hue**: hue (0-360) for background/foreground tinting (defaults to `20`)
- **Background tint amount**: percentage (0-100) of tint to apply (defaults to `100`)
- **Default time zone**: for `<time>` elements (defaults to your system zone)
- **Production base URL**: e.g. `https://example.edu`
- **Production base path**: e.g. `/cs101` (defaults to `/`)

Pass `--no-interactive` to skip prompts and use default values for all options.
You can also override specific defaults with flags:

    tada init mysite --no-interactive --prod-base https://example.edu --prod-base-path /cs101

Available flags: `--title`, `--symbol`, `--theme-color`, `--tint-hue`,
`--tint-amount`, `--default-time-zone`, `--prod-base`, `--prod-base-path`.


### `tada dev`

Build the site for local development (using `site.dev.json`)
into the `dist/` directory.


### `tada serve`

Start a development web server at `http://localhost:8080` which serves the
files in the `dist/` directory.


### `tada watch`

Start a development web server, watch for changes and rebuild automatically.


### `tada clean`

Remove the `dist/` directory. Pass `--prod` to also prune old production
builds (keeps the latest two versions).


### `tada prod`

Build the site for production (uses `site.prod.json`). Each prod build is
saved to a versioned directory under `dist-prod/` (e.g., `dist-prod/v1/`,
`dist-prod/v2/`) with a manifest file that records the SHA-256 hash of every
output file.


### `tada diff`

Compare two production builds and list added, changed, and removed files.
With no arguments, compares the last two builds. You can also specify version
numbers explicitly:

    tada diff          # compare latest two builds
    tada diff 1 3      # compare v1 and v3

Use `--copy <dir>` to copy only the changed and added files to a directory:

    tada diff --copy upload/

The output directory will also include a `manifest.json` for the newer build.


## Development vs. production builds

`tada dev` and `tada watch` build to the `dist/` directory using
`site.dev.json` (typically `localhost` URLs). `tada watch` includes a
development server with live reload; `tada serve` is a standalone server
for previewing a `tada dev` build. Dev builds overwrite `dist/` each time.

`tada prod` builds to a new versioned directory under `dist-prod/` each time
it runs. Previous production builds are preserved, so you can compare any
two versions with `tada diff`.


## Deploying to S3

If you host your site in an S3 bucket, `tada diff --copy` lets you upload
only the files that changed between prod builds instead of re-uploading
everything.

First time:

```
tada prod
# Upload the entire dist-prod/v1/ directory to your S3 bucket
```

After making changes:

```
tada prod
tada diff --copy upload/
# Upload just the upload/ directory to S3 (only changed files)
```

If `tada diff` reports removed files, delete those from your S3 bucket
manually.


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

- `site.dev.json` (used by `tada dev` / `tada watch`)
- `site.prod.json` (used by `tada prod`)
- `nav.json` (navigation structure)
- `authors.json` (author data)

Example site configuration JSON file:

```json
{
  "title": "Intro to Computer Science",
  "titlePostfix": " - CS 0",
  "symbol": "CS 0",
  "themeColor": "hsl(351 70% 40%)",
  "tintAmount": 0,
  "features": { "search": true, "code": true, "favicon": true },
  "base": "https://example.edu",
  "basePath": "/cs0",
  "internalDomains": ["example.edu"],
  "defaultTimeZone": "America/New_York",
  "codeLanguages": { "java": "java", "py": "python" },
  "vars": {
    "staffEmail": "staff@example.edu"
  }
}
```

| Field | Description |
|-------|-------------|
| `title` | Title for the whole site (also used to derive `titlePostfix`) |
| `titlePostfix` | *Optional*, the string to append to each page's `title` |
| `symbol` | Text (1-5 chars) displayed in header (also used as the favicon symbol) |
| `themeColor` | Theme color for the site (e.g., `"tomato"`, `"#c04040"`, `"hsl(195 70% 40%)"`) |
| `tintHue` | *Optional*, hue (0-360) for background and foreground tinting (default `20`) |
| `tintAmount` | *Optional*, percentage (0-100) of tint to apply (default `100`) |
| `faviconSymbol` | *Optional*, the text to use instead of `symbol` in the favicon |
| `features.search` | Enable search UI and Pagefind index generation |
| `features.code` | Enable generated source-code HTML pages for configured code extensions |
| `features.favicon` | Enable automatically generated favicons |
| `base` | Full base URL of the deployed site, used for metadata and URL generation |
| `basePath` | URL prefix for deployment under a subpath (e.g., `"/cs101"`), use `"/"` at root |
| `internalDomains` | Domain names treated as internal by link processing (not marked external) |
| `codeLanguages` | Map file extension to Shiki language (e.g., `"java": "java"`) |
| `faviconColor` | *Optional*, background color for favicon (defaults to `themeColor`) |
| `faviconFontWeight` | *Optional*, font weight used for favicon text (default `700`) |
| `vars` | Arbitrary key/value variables exposed to templates/content (e.g., `<%= staffEmail %>`) |


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


## Content

Site content lives in the `content/` directory. Markdown is converted to HTML.
HTML files should contain front matter and are also built.

Any other kinds of files are copied into `dist/` in the same locations.

All files in `public/` are copied directly into `dist/` with zero processing.
Files in `public/` are **not** included in the search index.


### Front matter fields

Each file in `content/` should start with "front matter" (a YAML-formatted
list of variables parsed using the [`front-matter`][front-matter] library).

| Field | Description |
|-------|-------------|
| `title` (required) | Page title (`<title>` tag and page heading) |
| `skip` | Set to `true` to skip building this page completely |
| `author` | Author handle (e.g. `jsmith`) resolved to a full object via `authors.json` |
| `description` | Meta description for the page |
| `toc` | Set to `true` to show a table of contents |
| `parent` & `parentLabel` | URL and label for a breadcrumb link displayed above the title |
| `published` | Year, month, and day of publishing (e.g, `2025-09-09`) |

You may also add arbitrary fields in a page's front matter, and access them
using Lodash syntax (see below).


### Variable substitution

Plain text content (e.g., HTML and Markdown) are processed using [Lodash
templates][lodash].

- Site config values are available under `site` (e.g., `site.title`)
- Page variables (from front matter) are available under `page`
- Custom variables from the `"vars"` property of the config are available
  without any prefix (e.g., `<%= staffEmail %>`)



[inter]: https://fonts.google.com/specimen/Inter
[lodash]: https://lodash.info/doc/template
[front-matter]: https://www.npmjs.com/package/front-matter
[pagefind]: https://pagefind.app/
[mutool]: https://mupdf.readthedocs.io/en/latest/tools/mutool.html
[jep467]: https://openjdk.org/jeps/467
