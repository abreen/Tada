# Authors

Author metadata is defined in `authors.json` at the project root. It maps author
handles to objects with a display name, avatar URL, and optional profile link.

When a page's front matter includes an `author` field, the handle is resolved
against this file. The rendered page shows a byline with the author's name and
avatar image, linked to the profile URL if provided.

The file is validated against a JSON schema at build time. The `avatar` and `url`
paths are also validated against the set of known build targets; a broken path
fails the build.

In watch mode, editing `authors.json` rebuilds only pages whose `author` field
depends on author entries whose data changed. Adding or removing an author
entry also rebuilds pages that reference that key.
