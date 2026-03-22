# HTML Content

Files with the `.html` extension in the content directory are treated as page
content. They support the same front matter format as Markdown files.

HTML content is processed through the template system but is not passed through
the Markdown pipeline. Link rewriting (base path prefixing, external link
marking, and internal link validation) is not applied to HTML content pages.

## Base path prefixing

Absolute internal links in HTML content pages are **not** prefixed with the
base path like Markdown pages are. Authors of HTML content should use the
`applyBasePath()` template function to prefix absolute internal URLs manually:

```html
<a href="<%= applyBasePath('/lectures/index.html') %>">Lectures</a>

<img src="<%= applyBasePath('/images/photo.png') %>">
```
