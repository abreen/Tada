# Tada :tada:

A statically generated site. The successor to Presto.

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


## Setup

1. Install [Bun](https://bun.sh/).
2. Install [MuPDF](https://mupdf.com/) (for PDF text extraction).
   - On macOS, use Homebrew to install [mupdf-tools](https://formulae.brew.sh/formula/mupdf-tools)
   - On Fedora, use `dnf` to install [mupdf](https://packages.fedoraproject.org/pkgs/mupdf/mupdf/)
   - On Windows, download a ZIP [from the official releases page](https://mupdf.com/releases?product=MuPDF)
3. Install the [Inter][inter] font (for favicon generation).
4. Run `bun install`.
5. Examine `config/site.dev.json`.
6. Run your first build using `bun dev`.
7. Start a local web server using `bun serve`.
8. Visit [http://localhost:8080/index.html](http://localhost:8080/index.html).

> [!NOTE]
> You may skip step 2 (installing MuPDF) if you don't need search results
> to include links to PDF pages. You can also turn off `features.search` in the
> config file to disable search entirely.

> [!NOTE]
> You may skip step 3 (installing the font) if you turn off `features.favicon`
> in the config file. You can also change the config to use a different font.

Here are the available scripts:

### `bun dev`

Build the site for local development (using `config/site.dev.json`)
into the `dist/` directory.

### `bun serve`

Start a development web server at `http://localhost:8080` which serves the
files in the `dist/` directory.

The web server does not automatically redirect requests for directories
to `/index.html` (simulates how a storage provider like Amazon S3 works).

### `bun watch`

Start a development web server, watch for changes and rebuild automatically.

### `bun clean`

Remove the `dist/` directory.

### `bun prod`

When you are happy with your changes, use `bun prod` to build the site
for production (uses `config/site.prod.json`).

> [!NOTE]
> Change `site.basePath` and `site.internalDomains` as needed.
> For example, if your site is hosted at `https://institution.edu/cs101/`,
> set `site.basePath` to `"/cs101"` and `site.internalDomains` to
> `["institution.edu"]`.

###  `bun format`

Invoke Prettier to fix code formatting across all files. This doesn't change
the `content/` directory, only the Tada source code.


## Building

The static site is saved to `dist/`. Markdown is converted to HTML.
HTML files should contain front matter and are also built, but not processed
like Markdown files are.

PDF, `.txt`, ZIP, images, and other kinds of files are copied into `dist/`
in the same locations.

All files in `public/` are copied directly into `dist/` with no processing.


### Configuration

Build-time site config lives in:

- `config/site.dev.json` (used by `bun dev` / `bun watch`)
- `config/site.prod.json` (used by `bun prod`)
- `config/_theme.scss` (contains variable definitions used in styles)

Example site configuration JSON file:

```json
{
  "features": { "search": true, "code": true, "favicon": true },
  "base": "https://example.edu",
  "basePath": "/cs101",
  "internalDomains": ["example.edu"],
  "codeLanguages": { "java": "java" },
  "titlePostfix": " - CS 101",
  "faviconColor": "hsl(351 70% 40%)",
  "faviconSymbol": "101",
  "faviconFont": "Inter",
  "faviconFontWeight": 700,
  "vars": {
    "courseCode": "CS 101",
    "courseTitle": "Intro to CS",
    "staffEmail": "staff@example.edu"
  }
}
```

| Field | Description |
|-------|-------------|
| `features.search` | Enable search UI and Pagefind index generation |
| `features.code` | Enable generated source-code HTML pages for configured code extensions |
| `features.favicon` | Enable automatically generated favicons |
| `base` | Full base URL of the deployed site, used for metadata and URL generation |
| `basePath` | URL prefix for deployment under a subpath (e.g., `"/2026"`), use `"/"` at root |
| `internalDomains` | Domain names treated as internal by link processing (not marked external) |
| `codeLanguages` | Map file extension to Shiki language (e.g., `"java": "java"`) |
| `titlePostfix` | Suffix appended to each page `<title>` |
| `faviconColor` | SVG-compatible color used by favicon generation (hex, HSL, RGB, etc.) |
| `faviconSymbol` | Short string rendered in generated favicon (e.g., "101") |
| `faviconFont` | Font family used for favicon text (e.g., `"Inter"`) |
| `faviconFontWeight` | Font weight used for favicon text (e.g., `700`) |
| `vars` | Arbitrary key/value variables exposed to templates/content (e.g., `<%= staffEmail %>`) |


### Front matter fields

Each file in `content/` should start with "front matter" (a YAML-formatted
list of variables parsed using the [`front-matter`][front-matter] library).

| Field | Description |
|-------|-------------|
| `title` (required) | Page title (`<title>` tag and page heading) |
| `skip` | Set to `true` to skip building this page completely |
| `author` | Author handle (e.g. `jsmith`) resolved via `templates/authors.json` |
| `description` | Meta description for the page |
| `toc` | Set to `true` to show a table of contents |
| `parent` & `parentLabel` | URL and label for a breadcrumb link displayed above the title |
| `published` | Year, month, and day of publishing (e.g, `2025-09-09`) |


### HTML

HTML content is inserted into the `<main>` element.

* HTML comments starting with two hyphens (`<!--`) appear in the final page
* But comments with three hyphens (`<!---`) **are removed**

Example front matter:

```html
title: Title of Page
author: jsmith

<p>Foo <b>bar</b> <i>baz</i> <a href="google.com">Google</a></p>
```


### Markdown

Markdown is converted to HTML using the [MarkdownIt][markdownit] library
and inserted into the `<main>` element.

Example:

```markdown
title: Title of Page

Foo *bar* [external](http://google.com) [internal](/other)
```

Results in this HTML:

```markdown
<head>...<title>Title of Page</title>...</head>
...
<p>Foo <em>bar</em>
<a class="external" href="http://google.com">external</a>
<a href="/basePath/other">internal</a>
```

Note that internal links (starting with `/`) are automatically prefixed with the
`site.basePath` value.

Full URLs are compared against `site.internalDomains`; links that point externally
automatically get `target="_blank"` and the `.external` CSS class.


### Variable substitution

Plain text content (e.g., HTML and Markdown) are processed using [Lodash
templates][lodash].

- Variables from `site.{dev,prod}.json` are available under `site` (e.g., `site.courseTitle`)
- Page variables (from front matter) are available under `page` (e.g., `page.author`)
- Custom variables from the `"vars"` property of `site.{dev,prod}.json` are
  available without any prefix (e.g., `<%= staffEmail %>`)

Lodash allows you to embed variables and JavaScript logic directly in HTML
templates and plain text content.

- `<%= variable %>`: Outputs and HTML-escapes the value of a variable.
- `<%- variable %>`: Outputs the unescaped value of a variable (use with caution).
- `<% code %>`: Runs JavaScript logic (e.g., loops, conditionals, assignments) without output.

You can use any JavaScript expression inside these tags. For example, you can
write a loop:

```
<ul>
<% for (let i = 0; i < 5; i++) { %>
  <li><%= Math.pow(2, i) %></li>
<% } %>
</ul>
```


### Search index

When search is enabled, a search index is built using [Pagefind][pagefind] and
saved to `dist/`.

After the entire site is built, the HTML output is crawled (starting from the
root `index.html`) to produce a list of pages to be indexed. This means a
page must have at least one incoming link to be included in search results.

- See the build-time code in `webpack/pagefind-plugin.js`
- See the client-side code in `src/search/`


### PDFs

PDFs in `content/` are copied to the same relative path in `dist/`. For example,
`content/lecture1/intro.pdf` becomes `dist/lecture1/intro.pdf`.

When search is enabled, any PDF that is reachable from the site is also read for
searchable text and added to the Pagefind index. If text is found on a given
page of a PDF, Pagefind results use `#page=` to link to a specific page
(for example, `/lecture1/intro.pdf#page=2`).



[inter]: https://fonts.google.com/specimen/Inter
[lodash]: https://lodash.info/doc/template
[front-matter]: https://www.npmjs.com/package/front-matter
[markdownit]: https://www.npmjs.com/package/markdown-it
[webpack]: https://webpack.js.org/
[pagefind]: https://pagefind.app/
[mutool]: https://mupdf.readthedocs.io/en/latest/tools/mutool.html
[jep467]: https://openjdk.org/jeps/467
