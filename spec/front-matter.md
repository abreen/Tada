# Front Matter

Every content page starts with front matter: a YAML block of `key: value`
lines at the top of the file. Tada supports two equivalent formats.

## Standard format (preferred)

The front matter is wrapped in `---` delimiter lines. This is the format used
by most static site generators and is recommended for new content.

```
---
title: My Page
author: alex
published: 2025-09-09
---

Page content starts here.
```

The opening `---` must be the first line of the file. The closing `---` must
appear on its own line. Both delimiters accept trailing whitespace, but no
leading whitespace. Everything between the delimiters is parsed as YAML.
Everything after the closing delimiter is the page content.

If a file starts with `---` but no closing delimiter is found, the build
fails with a clear error.

## Legacy format (Presto-compatible)

For compatibility with content authored for Presto, Tada also accepts front
matter without `---` delimiters. In this format, a blank line ends the front
matter and begins the page content.

```
title: My Page
author: alex
published: 2025-09-09

Page content starts here.
```

A file is treated as legacy format if its first line is anything other than
`---` after removing trailing whitespace. Both formats produce identical
results; choose one per file.

## Fields

- **title** (required, except on the home page): page title for `<title>` and
  the page heading (see [Home page without a title](#home-page-without-a-title));
  [wikilinks](wikilinks.md) such as `[[My Page]]` link to a page by
  its exact title
- **author**: author handle, resolved against the authors config file
- **description**: meta description
- **published**: publication date, displayed below the title
- **toc**: set to `true` to render a table of contents
- **slides**: on Markdown pages, set to `true` to treat top-level `---` lines
  in the page body as slide separators and add a `Present` control (see
  [Slides Mode](slides.md)); HTML content pages and literate Java pages with
  `slides: true` fail the build
- **breadcrumbs**: ordered list of ancestor links, each with a nonempty string
  `label` and internal `url` (see [Breadcrumbs](breadcrumbs.md)); not allowed on
  pages listed in a [document index](document-index.md), whose tree shows
  their ancestors instead
- **skip**: set to `true` to exclude the page from the build
- **stdin**: input string sent to a literate Java program's stdin at build time (see [Literate Java](literate-java.md))
- **scripts**: list of scripts to compile and run on the page, as paths
  relative to `src/` or `npm:` paths to modules of installed packages (see
  [Author Scripts](author-scripts.md) and [Packages](packages.md)); the build
  fails if it is not a list of valid paths to existing scripts. `scripts:` with
  no value means no scripts

Title and description support inline Markdown formatting. The rendered HTML is
used for the page heading, and a plain-text version is used for `<title>`,
`og:title`, and the meta description. The plain text keeps every character the
reader sees: tags are removed and character references are decoded exactly
once, so a description such as ``Uses `a < b` and 6" rulers`` keeps both the
`<` and the `b`.

## Unknown keys

Front matter fields are not template variables. Any key not listed above (or
under reserved keys below) is ignored, and the build logs a warning such as
`content/index.md: ignoring unknown front matter field "toolName"; put custom
variables under "vars" in the site config`. Define reusable values as
[site variables](variables.md) instead.

## Reserved keys

Tada reserves internal page variables and the retired `parent` and
`parentLabel` fields. A page whose front matter uses one of these keys fails the
build with an error such as
`content/exam.md: front matter key "template" is reserved`:

- `template`
- `titleHtml`
- `descriptionHtml`
- `tocHtml`
- `tocItems`
- `codeFilePath`
- `downloadName`
- `filePath`
- `parent`
- `parentLabel`

This applies to Markdown, HTML, and literate Java pages.

## Variables

Top-level string front matter values can use [site variables](variables.md),
for example `description: Lecture notes for {{ courseName }}`. This also
applies to each breadcrumb entry's `label` and `url` before validation.
Substitution cannot generate the YAML structure itself. A value that
starts with a variable must be quoted, for example
`title: "{{ courseName }} home"`; an unquoted one fails the build.

## Home page without a title

The site's home page (`content/index.md` or `content/index.html`, published as
`/index.html`) may omit `title`. Every other page, including `index` pages in
subdirectories, still fails the build without one. The home page still needs a
front matter block, which may be empty (`---` on two lines): without the `---`
line, the legacy format reads the page's first paragraph as front matter.

Without a title, the page's `<title>` and `og:title` are the site title alone,
without `titlePostfix`, and the page heading has no `<h1>`. The whole heading
block (`.title-and-info`) is omitted unless the page has a `published` date or
an `author`, which it still shows. `breadcrumbs` require a title; a nonempty list without a title fails the build. In search
results, the page is listed under the site title, which Pagefind takes from the
`<title>` when a page has no `<h1>`.
