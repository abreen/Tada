# Templates

Tada uses Lodash HTML templates to wrap page content. **Templates are internal
to the package and not edited by site authors.** They use the `render()`
function to assemble a complete page.

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
loading project config files, generating CSS class strings, and rendering the
time zone chooser.

Site config values are accessible in templates. Values in `nav.*` and
`authors.*` may use quoted `{site.path}` and `{vars.path}` expressions. A
whole-value expression preserves its native type. Site config files themselves
define `site` and `vars` and are not interpolated.
