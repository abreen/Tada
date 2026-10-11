# Templates

Tada uses Lodash HTML templates to wrap page content. **Templates are internal
to the package and not edited by site authors.** They use the `render()`
function to assemble a complete page. Lodash is only used by these internal
templates (and the internal theme stylesheet); author content uses
[site variables](variables.md) instead.

## Page templates

- **default**: standard page layout for Markdown and HTML content
- **code**: source code page with line numbers and TOC
- **literate**: literate Java page with execution output

## Template variables

Templates can access:

- **page.\***: front matter fields (title, author, description, published, etc.)
- **site.\***: all site config values
- **content**: the rendered page body
- **isHomePage**: true when rendering the home page

Utility functions are available for formatting dates, rendering other templates,
loading project config files, and generating CSS class strings.

Templates output plain-text values (page title and description, author name,
breadcrumb labels and the current breadcrumb title, nav section titles and link text, site title and symbol,
download names, and code search entries) with the escaping `<%- %>` form, so
quotes, `<`, and `&` never break an attribute or element. Values that already
hold HTML (`content`, `bannerHtml`, `page.tocHtml`, `page.titleHtml` in element
bodies, and `render(...)` output) use `<%= %>`.

Template rendering failures abort the build and identify the innermost failing
HTML template. Rendering a template name that does not exist is a failure too,
never an empty page. Each render attempt tracks errors independently, including
retries and template recompilation in watch mode. A failed render never becomes
a successful partial page; correcting the content allows the next render to
complete normally.

## Template syntax

Tada recognizes only the `<% %>` (evaluate), `<%= %>` (interpolate without
escaping), and `<%- %>` (interpolate with HTML escaping) delimiters. ES template
literal syntax such as `${name}` is literal text in the internal templates.
