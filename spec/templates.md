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

Site config values are accessible in templates. You may also use site config
values in the `nav.*` and `authors.*` config files. In those config files,
Lodash templating is only supported inside individual values; it cannot
generate or conditionally modify the YAML/JSON structure itself.

Template rendering failures abort the build and identify the innermost failing
HTML template. Each render attempt tracks errors independently, including
retries and template recompilation in watch mode. A failed render never becomes
a successful partial page; correcting the content allows the next render to
complete normally.
