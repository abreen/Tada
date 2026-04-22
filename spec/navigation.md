# Navigation

Site navigation is defined in `nav.json` at the project root. It is an array of
sections, each with a title and a list of links.

Each link has display text and either an internal path or an external URL. Links
can be marked as disabled (rendered but not clickable).

The navigation is validated against a JSON schema at build time. Internal links
are also validated against the set of known pages; a broken link fails the build.
Internal paths in `nav.json` must be root-relative (start with `/`) because they
are rendered site-wide from templates, not relative to any individual page.
Disabled links are exempt because they produce no `href` in the rendered HTML.
