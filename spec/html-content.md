# HTML Content

Files with the `.html` extension in the content directory are treated as page
content. They support the same front matter format as Markdown files.

HTML content is processed through the template system but is not passed through
the Markdown pipeline. External-link decoration is not applied to HTML content,
but final page processing still rewrites and validates internal URLs.

## Internal URLs

Authors of HTML content should write root-relative internal URLs directly:

```html
<a href="/lectures/index.html">Lectures</a>

<img src="/images/photo.png">
```

When Tada assembles the final HTML page, it:

- prefixes root-relative `href` and `src` attributes with `basePath`
- rewrites links to mapped code files (for example, `/App.java`) to the
  generated code page when one exists
- validates rendered internal links against the set of known output targets

Relative links remain relative and are not prefixed with `basePath`.
