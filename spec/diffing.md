# Build Diffing

Tada can compare two production builds to show what changed. It reads the
manifests of two versions and uses file hashes to identify added, changed, and
removed files.

By default, the two most recent versions are compared. Specific version numbers
can also be provided.

A copy mode extracts only the changed files (added and modified) into a separate
directory, along with the search index and a fresh manifest. This supports
incremental deployment workflows where only changed files are uploaded.
