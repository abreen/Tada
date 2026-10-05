# Authors

Author metadata is defined in `authors.yaml`, `authors.yml`, or `authors.json`
at the project root. `tada init` creates `authors.yaml` by default in
non-bare mode. It maps author handles to objects with a display name, avatar
URL, and optional profile link.

When a page's front matter includes an `author` field, the handle is resolved
against this file. The rendered page shows a byline with the author's name and
avatar image, linked to the profile URL if provided.

Author handles match only entries explicitly defined in the config. A handle
that is not listed fails the build as an unknown author; handles such as
`constructor`, `toString`, and `__proto__` are valid when explicitly configured.

The file is validated against a JSON schema at build time. The `avatar` path
must be a root-relative internal URL and is validated against the set of known
build targets; a broken path fails the build. Avatar URLs may include a fragment
(for example, `/images/portrait.svg#portrait`); validation checks the file's
pathname and preserves the fragment in the rendered image URL. The optional `url` may be either a
root-relative internal URL, which is also validated against known build targets,
or an absolute URL. Authored profile URLs are encoded when rendered so spaces
and HTML-significant characters do not appear raw in `href` attributes, while
existing percent escapes remain intact.

In watch mode, editing the authors config rebuilds only pages whose `author`
field depends on author entries whose data changed. Adding or removing an
author entry also rebuilds pages that reference that key.
